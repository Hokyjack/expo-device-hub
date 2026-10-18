import XCTest
@testable import StreamingPolicy

final class PanelFrameCadenceTests: XCTestCase {
    func testStaticPanelUsesFiveKeepalivesPerSecondInsteadOfSixtyEncodes() {
        var cadence = PanelFrameCadence()
        // Give the initial active cadence time to settle into idle mode.
        for frame in 0..<36 { _ = cadence.shouldSend(atNanoseconds: UInt64(frame) * 16_666_667) }
        let skippedBefore = cadence.skippedRepeats
        let sends = (36..<96).filter { cadence.shouldSend(atNanoseconds: UInt64($0) * 16_666_667) }
        XCTAssertEqual(sends.count, 5)
        XCTAssertEqual(cadence.skippedRepeats - skippedBefore, 55)
    }

    func testFreshFramesResumeImmediatelyWithoutWaitingForTheIdleDeadline() {
        var cadence = PanelFrameCadence()
        XCTAssertTrue(cadence.shouldSend(atNanoseconds: 0))
        for frame in 1...120 {
            cadence.frameChanged(atNanoseconds: UInt64(frame) * 16_666_667)
            XCTAssertTrue(cadence.shouldSend(atNanoseconds: UInt64(frame) * 16_666_667))
        }
        XCTAssertEqual(cadence.skippedRepeats, 0)
    }

    func testNewPeerOrRebootCanRequestAnImmediateUnchangedFrame() {
        var cadence = PanelFrameCadence()
        XCTAssertTrue(cadence.shouldSend(atNanoseconds: 0))
        XCTAssertTrue(cadence.shouldSend(atNanoseconds: 600_000_000))
        XCTAssertFalse(cadence.shouldSend(atNanoseconds: 616_666_667))
        cadence.requestFrame()
        XCTAssertTrue(cadence.shouldSend(atNanoseconds: 633_333_334))
        XCTAssertFalse(cadence.shouldSend(atNanoseconds: 650_000_001))
    }

    func testActiveAnimationRetainsTheRepeatCadenceBetweenFreshFrames() {
        var cadence = PanelFrameCadence()
        for frame in 0..<120 {
            let now = UInt64(frame) * 16_666_667
            if frame.isMultiple(of: 2) { cadence.frameChanged(atNanoseconds: now) }
            XCTAssertTrue(cadence.shouldSend(atNanoseconds: now))
        }
        XCTAssertEqual(cadence.skippedRepeats, 0)
        // Fresh pixels after a long idle period also bypass the deadline.
        XCTAssertTrue(cadence.shouldSend(atNanoseconds: 3_000_000_000))
        XCTAssertFalse(cadence.shouldSend(atNanoseconds: 3_016_666_667))
        cadence.frameChanged(atNanoseconds: 3_020_000_000)
        XCTAssertTrue(cadence.shouldSend(atNanoseconds: 3_020_000_000))
    }
}
