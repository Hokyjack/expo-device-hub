/// Fixed Duo panel feeds keep a static picture alive without repeatedly spending
/// the shared VM encoder budget on identical pixels. Fresh pixels bypass the cap.
public struct PanelFrameCadence: Sendable {
    public private(set) var skippedRepeats: UInt64 = 0
    private var changed = true
    private var lastSentNs: UInt64?
    private var lastChangedNs: UInt64?
    private static let idleIntervalNs: UInt64 = 200_000_000
    private static let idleAfterNs: UInt64 = 500_000_000

    public init() {}

    public mutating func frameChanged(atNanoseconds now: UInt64) {
        changed = true
        lastChangedNs = now
    }

    public mutating func requestFrame() { changed = true }

    public mutating func shouldSend(atNanoseconds now: UInt64) -> Bool {
        if lastChangedNs == nil { lastChangedNs = now }
        let idle = lastChangedNs.map { now >= $0 && now - $0 >= Self.idleAfterNs } ?? false
        if idle, !changed, let lastSentNs, now >= lastSentNs, now - lastSentNs < Self.idleIntervalNs {
            skippedRepeats &+= 1
            return false
        }
        changed = false
        lastSentNs = now
        return true
    }
}
