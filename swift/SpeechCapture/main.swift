/**
 * speech-capture — WhisperDesk live transcription via Apple Speech framework.
 *
 * Combines ScreenCaptureKit (system audio) with SFSpeechRecognizer (on-device
 * transcription) to produce streaming partial + final results with very low
 * latency, eliminating the WAV-file/whisper-cli round-trip.
 *
 * Usage:
 *   speech-capture [--language <locale>]
 *
 * Locale examples: en-US  zh-Hans  ja-JP  fr-FR  (default: en-US)
 *
 * stdout: JSON lines
 *   {"type":"partial","text":"hello wor","segmentId":0}
 *   {"type":"final",  "text":"Hello, world.",  "segmentId":0}
 *   {"type":"error",  "message":"..."}
 *
 * stderr: READY  /  STOPPED  /  WARN  /  ERROR
 *
 * Requirements: macOS 13+, Screen Recording permission, Speech Recognition
 * permission (prompted automatically on first run).
 */

import Foundation
import Speech
import ScreenCaptureKit
import CoreMedia
import AVFoundation

// MARK: - JSON output helpers

private func outputJSON(_ dict: [String: Any]) {
    guard
        let data = try? JSONSerialization.data(withJSONObject: dict),
        let str  = String(data: data, encoding: .utf8)
    else { return }
    print(str)
    fflush(stdout)
}

// MARK: - Speech capture manager

@available(macOS 13.0, *)
final class SpeechCapture {

    // Serialises all state mutations — guarantees ordering of audio chunks
    // and thread-safe access from both the sample-handler queue and the
    // recognition-task callback queue.
    private let queue = DispatchQueue(label: "com.whisperdesk.speech", qos: .userInteractive)

    private let recognizer:  SFSpeechRecognizer
    private let audioFormat: AVAudioFormat

    // Mutable state — accessed only on `queue`
    private var currentRequest: SFSpeechAudioBufferRecognitionRequest?
    private var currentTask:    SFSpeechRecognitionTask?
    private var nextSegId       = 0
    private var segmentFrames   = 0
    private var silentFrames    = 0
    private var isEnding        = false
    private var isStopped       = false

    // Silence-detection / segment-length tuning
    private let sampleRate:       Double = 16_000
    private let silenceRMS:       Float  = 0.008   // ~quiet room level
    private let silenceTriggerMs: Double = 600     // 0.6 s of silence → flush
    private let minSegmentMs:     Double = 500     // don't flush before 0.5 s
    private let maxSegmentMs:     Double = 12_000  // hard cap ~12 s

    init?(language: String) {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
            return nil
        }
        self.recognizer  = rec
        self.audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 16_000,
            channels: 1,
            interleaved: false
        )!
    }

    // MARK: Public API

    func start() {
        queue.async { self.startNewSegment() }
    }

    func appendFloat32(_ floats: [Float]) {
        queue.async { self.appendOnQueue(floats) }
    }

    func stop() {
        queue.async {
            self.isStopped = true
            self.currentRequest?.endAudio()
            self.currentTask?.cancel()
        }
    }

    // MARK: Queue-bound implementation

    private func startNewSegment() {
        guard !isStopped else { return }

        isEnding      = false
        segmentFrames = 0
        silentFrames  = 0

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.requiresOnDeviceRecognition = true
        req.shouldReportPartialResults  = true
        req.taskHint                    = .dictation

        let segId = nextSegId
        nextSegId += 1
        currentRequest = req

        currentTask = recognizer.recognitionTask(with: req) { [weak self] result, error in
            self?.queue.async {
                self?.handleResult(result: result, error: error, segId: segId)
            }
        }
    }

    private func appendOnQueue(_ floats: [Float]) {
        guard let req = currentRequest, !isEnding else { return }

        // Build AVAudioPCMBuffer
        let frameCount = AVAudioFrameCount(floats.count)
        guard let pcm = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: frameCount) else { return }
        pcm.frameLength = frameCount
        floats.withUnsafeBufferPointer { src in
            pcm.floatChannelData?[0].update(from: src.baseAddress!, count: floats.count)
        }
        req.append(pcm)

        segmentFrames += floats.count

        // RMS silence detection
        let rms = Float(sqrt(floats.reduce(0.0) { $0 + Double($1 * $1) } / Double(max(floats.count, 1))))
        if rms < silenceRMS {
            silentFrames += floats.count
        } else {
            silentFrames = 0
        }

        let silenceThresh = Int(silenceTriggerMs / 1_000 * sampleRate)
        let minFrames     = Int(minSegmentMs    / 1_000 * sampleRate)
        let maxFrames     = Int(maxSegmentMs    / 1_000 * sampleRate)

        if segmentFrames >= minFrames &&
           (silentFrames >= silenceThresh || segmentFrames >= maxFrames) {
            isEnding = true
            req.endAudio()
        }
    }

    private func handleResult(result: SFSpeechRecognitionResult?, error: Error?, segId: Int) {
        var restarted = false

        if let r = result {
            let text = r.bestTranscription.formattedString
                .trimmingCharacters(in: .whitespacesAndNewlines)

            if r.isFinal {
                if !text.isEmpty {
                    outputJSON(["type": "final", "text": text, "segmentId": segId])
                }
                if !isStopped {
                    startNewSegment()
                }
                restarted = true
            } else if !text.isEmpty {
                outputJSON(["type": "partial", "text": text, "segmentId": segId])
            }
        }

        if let err = error, !restarted {
            let nsErr = err as NSError
            // Ignore expected end-of-segment codes
            let ignoredCodes = [203, 1110, 301]
            if !(nsErr.domain == "kAFAssistantErrorDomain" && ignoredCodes.contains(nsErr.code)) {
                fputs("WARN: Recognition error (seg \(segId)): \(err.localizedDescription)\n", stderr)
            }
            if !isStopped {
                startNewSegment()
            }
        }
    }
}

// MARK: - SCStream output handler

@available(macOS 13.0, *)
final class AudioOutputHandler: NSObject, SCStreamOutput, SCStreamDelegate {
    let speechCapture: SpeechCapture

    init(speechCapture: SpeechCapture) {
        self.speechCapture = speechCapture
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio else { return }
        guard let blockBuffer = sampleBuffer.dataBuffer else { return }

        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(
            blockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: nil,
            totalLengthOut: &length,
            dataPointerOut: &dataPointer
        )
        guard status == kCMBlockBufferNoErr, let ptr = dataPointer, length > 0 else { return }

        guard
            let formatDesc = sampleBuffer.formatDescription,
            let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)
        else { return }

        let fmt = asbd.pointee
        let isFloat = (fmt.mFormatFlags & kAudioFormatFlagIsFloat) != 0

        if isFloat && fmt.mBitsPerChannel == 32 {
            let count    = length / MemoryLayout<Float>.size
            let floatPtr = UnsafeRawPointer(ptr).bindMemory(to: Float.self, capacity: count)
            // Copy before dispatching — pointer is only valid during this callback
            let floats = Array(UnsafeBufferPointer(start: floatPtr, count: count))
            speechCapture.appendFloat32(floats)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("ERROR: Stream stopped: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Main async run

@available(macOS 13.0, *)
func run(language: String) async throws {

    // Note: SFSpeechRecognizer.requestAuthorization() crashes CLI tools that
    // have no bundle (the OS looks for NSSpeechRecognitionUsageDescription and
    // kills the process when it isn't found).  Instead we check the current
    // status and surface a helpful message via the recognition task errors if
    // authorization hasn't been granted yet.  The user can grant it in:
    //   System Settings → Privacy & Security → Speech Recognition → WhisperDesk
    let authStatus = SFSpeechRecognizer.authorizationStatus()
    if authStatus == .denied || authStatus == .restricted {
        fputs(
            "ERROR: Speech recognition is not authorized (status \(authStatus.rawValue)). " +
            "Open System Settings → Privacy & Security → Speech Recognition and enable WhisperDesk.\n",
            stderr
        )
        exit(2)
    }
    if authStatus == .notDetermined {
        fputs(
            "WARN: Speech recognition permission not yet determined. " +
            "The first recognition request may fail — grant permission in " +
            "System Settings → Privacy & Security → Speech Recognition.\n",
            stderr
        )
    }

    // Resolve effective locale — SFSpeechRecognizer needs a specific BCP-47 tag.
    // "auto" → zh-Hans: covers Chinese (including code-switched English phrases)
    // which is the most common use case for mixed Zoom meetings.
    let effectiveLocale: String
    switch language {
    case "auto", "zh", "zh-Hans", "zh-CN", "zh-hans":
        effectiveLocale = "zh-Hans"
    case "en", "en-US":
        effectiveLocale = "en-US"
    default:
        effectiveLocale = language
    }
    if effectiveLocale != language {
        fputs("INFO: Mapped language '\(language)' → '\(effectiveLocale)'\n", stderr)
    }

    // Validate recognizer
    guard let speechCapture = SpeechCapture(language: effectiveLocale) else {
        fputs("ERROR: Speech recognizer not available for language: \(effectiveLocale)\n", stderr)
        exit(1)
    }

    // 3. ScreenCaptureKit setup
    let content: SCShareableContent
    do {
        content = try await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: false
        )
    } catch {
        fputs(
            "ERROR: Cannot access screen content. Grant Screen Recording permission in " +
            "System Settings → Privacy & Security → Screen Recording, then restart.\n",
            stderr
        )
        exit(2)
    }

    guard let display = content.displays.first else {
        fputs("ERROR: No display found.\n", stderr)
        exit(1)
    }

    let filter = SCContentFilter(display: display, excludingWindows: [])
    let config = SCStreamConfiguration()
    config.capturesAudio            = true
    config.sampleRate               = 16_000
    config.channelCount             = 1
    config.excludesCurrentProcessAudio = true
    config.width                    = 2
    config.height                   = 2
    config.minimumFrameInterval     = CMTime(value: 1, timescale: 1) // 1 fps

    let handler = AudioOutputHandler(speechCapture: speechCapture)
    let stream  = SCStream(filter: filter, configuration: config, delegate: handler)
    try stream.addStreamOutput(
        handler, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive)
    )
    try await stream.startCapture()

    // 4. Start recognition pipeline
    speechCapture.start()

    fputs("READY\n", stderr)
    fflush(stderr)

    // 5. Wait for SIGTERM / SIGINT
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        var resumed = false
        let resume: () -> Void = {
            guard !resumed else { return }
            resumed = true
            continuation.resume()
        }

        signal(SIGTERM, SIG_IGN)
        signal(SIGINT,  SIG_IGN)

        let sigTerm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .global())
        let sigInt  = DispatchSource.makeSignalSource(signal: SIGINT,  queue: .global())

        for src in [sigTerm, sigInt] {
            src.setEventHandler {
                Task {
                    speechCapture.stop()
                    try? await stream.stopCapture()
                    fputs("STOPPED\n", stderr)
                    resume()
                }
            }
            src.resume()
        }
    }

    exit(0)
}

// MARK: - Entry point

let cliArgs = CommandLine.arguments
var language = "en-US"
if let idx = cliArgs.firstIndex(of: "--language"), idx + 1 < cliArgs.count {
    language = cliArgs[idx + 1]
}

if #available(macOS 13.0, *) {
    Task {
        do {
            try await run(language: language)
        } catch {
            fputs("ERROR: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
    RunLoop.main.run()
} else {
    fputs("ERROR: macOS 13.0 or later is required for speech capture.\n", stderr)
    exit(1)
}
