import Foundation
import Translation

// MARK: - Wire types

private struct TranslateRequest: Codable {
    let id: Int
    let text: String
    let from: String   // BCP 47, e.g. "zh-Hans" or "en"
    let to: String
}

private struct TranslateResponse: Codable {
    let id: Int
    let translation: String?
    let error: String?
}

// MARK: - Helpers

private func outputJSON<T: Encodable>(_ value: T) {
    guard
        let data = try? JSONEncoder().encode(value),
        let str  = String(data: data, encoding: .utf8)
    else { return }
    print(str)
    fflush(stdout)
}

/// Yields lines from stdin on a background thread so the main actor stays free.
private func stdinLines() -> AsyncStream<String> {
    AsyncStream { continuation in
        DispatchQueue.global(qos: .userInitiated).async {
            while let line = readLine() {
                continuation.yield(line)
            }
            continuation.finish()
        }
    }
}

// MARK: - Core loop

@available(macOS 26.0, *)
private func run() async {
    fputs("READY\n", stderr)
    fflush(stderr)

    // Cache one session per direction to avoid repeated framework overhead.
    var sessions: [String: TranslationSession] = [:]

    for await line in stdinLines() {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { continue }

        guard
            let data = trimmed.data(using: .utf8),
            let req  = try? JSONDecoder().decode(TranslateRequest.self, from: data)
        else {
            fputs("WARN: Failed to decode request: \(trimmed)\n", stderr)
            continue
        }

        let key = "\(req.from)->\(req.to)"

        if sessions[key] == nil {
            let src = Locale.Language(identifier: req.from)
            let tgt = Locale.Language(identifier: req.to)
            sessions[key] = TranslationSession(installedSource: src, target: tgt)
        }

        let session = sessions[key]!

        do {
            let result = try await session.translate(req.text)
            outputJSON(TranslateResponse(id: req.id, translation: result.targetText, error: nil))
        } catch {
            fputs("WARN: Translation error (\(key)): \(error)\n", stderr)
            outputJSON(TranslateResponse(id: req.id, translation: nil, error: error.localizedDescription))
        }
    }

    exit(0)
}

// MARK: - Entry point

if #available(macOS 26.0, *) {
    Task {
        await run()
    }
    // RunLoop keeps the process alive and drives the async Task.
    // Must be called at the top level, never inside the async function.
    RunLoop.main.run()
} else {
    fputs("ERROR: macOS 26.0 or later is required for Apple Translation.\n", stderr)
    exit(1)
}
