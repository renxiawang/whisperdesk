import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation

// MARK: - Audio Output Handler

@available(macOS 13.0, *)
class AudioOutputHandler: NSObject, SCStreamOutput, SCStreamDelegate {
    private let sampleRate: Int
    private let channels: Int

    init(sampleRate: Int, channels: Int) {
        self.sampleRate = sampleRate
        self.channels = channels
        super.init()
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

        guard let formatDesc = sampleBuffer.formatDescription,
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)
        else { return }

        let format = asbd.pointee
        let isFloat = (format.mFormatFlags & kAudioFormatFlagIsFloat) != 0

        if isFloat && format.mBitsPerChannel == 32 {
            let floatCount = length / MemoryLayout<Float>.size
            let floatPtr = UnsafeRawPointer(ptr).bindMemory(to: Float.self, capacity: floatCount)
            var int16Data = [Int16](repeating: 0, count: floatCount)
            for i in 0..<floatCount {
                let clamped = max(-1.0, min(1.0, floatPtr[i]))
                int16Data[i] = Int16(clamped * 32767.0)
            }
            int16Data.withUnsafeBytes { rawBuffer in
                FileHandle.standardOutput.write(Data(rawBuffer))
            }
        } else if !isFloat && format.mBitsPerChannel == 16 {
            FileHandle.standardOutput.write(Data(bytes: ptr, count: length))
        } else {
            fputs("WARN: Unexpected audio format: float=\(isFloat) bits=\(format.mBitsPerChannel)\n", stderr)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("ERROR: Stream stopped: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Main

@available(macOS 13.0, *)
func run() async throws {
    let sampleRate = 16000
    let channels = 1

    let content: SCShareableContent
    do {
        content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    } catch {
        fputs("ERROR: Cannot access screen content. Grant Screen Recording permission in System Settings > Privacy & Security > Screen Recording, then restart.\n", stderr)
        exit(2)
    }

    guard let display = content.displays.first else {
        fputs("ERROR: No display found.\n", stderr)
        exit(1)
    }

    let filter = SCContentFilter(display: display, excludingWindows: [])
    let config = SCStreamConfiguration()
    config.capturesAudio = true
    config.sampleRate = sampleRate
    config.channelCount = channels
    config.excludesCurrentProcessAudio = true
    // Minimal video to reduce overhead (ScreenCaptureKit requires a display)
    config.width = 2
    config.height = 2
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps

    let handler = AudioOutputHandler(sampleRate: sampleRate, channels: channels)
    let stream = SCStream(filter: filter, configuration: config, delegate: handler)
    try stream.addStreamOutput(handler, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))
    try await stream.startCapture()

    fputs("READY\n", stderr)

    // Wait for a stop signal using a continuation — do NOT call dispatchMain() here
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        var resumed = false
        let resume: () -> Void = {
            guard !resumed else { return }
            resumed = true
            continuation.resume()
        }

        signal(SIGTERM, SIG_IGN)
        signal(SIGINT, SIG_IGN)

        let sigTermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .global())
        let sigIntSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .global())

        for source in [sigTermSource, sigIntSource] {
            source.setEventHandler {
                Task {
                    try? await stream.stopCapture()
                    fputs("STOPPED\n", stderr)
                    resume()
                }
            }
            source.resume()
        }
    }

    exit(0)
}

if #available(macOS 13.0, *) {
    Task {
        do {
            try await run()
        } catch {
            fputs("ERROR: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
    // RunLoop.main.run() keeps the process alive and drives the async Task.
    // Called exactly once, at the top level — never inside the async function.
    RunLoop.main.run()
} else {
    fputs("ERROR: macOS 13.0 or later is required for system audio capture.\n", stderr)
    exit(1)
}
