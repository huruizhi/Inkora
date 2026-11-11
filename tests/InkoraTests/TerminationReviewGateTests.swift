import XCTest

final class TerminationReviewGateTests: XCTestCase {
  @MainActor
  func testSaveAndDiscardBothFinishRecoveryAfterReview() async {
    for _ in ["save", "discard"] {
      let gate = TerminationReviewGate()
      var events: [String] = []
      let completed = expectation(description: "quit reviewed")
      gate.begin(
        preparations: [
          { done in
            events.append("snapshot")
            done(true)
          }
        ],
        review: { done in
          events.append("review")
          done(true)
        },
        finishRecovery: { events.append("recovery") },
        reply: { approved in
          XCTAssertTrue(approved)
          completed.fulfill()
        })
      XCTAssertTrue(gate.inProgress)
      XCTAssertFalse(
        gate.begin(
          preparations: [], review: { _ in XCTFail() },
          finishRecovery: { XCTFail() }, reply: { _ in XCTFail() }))
      await fulfillment(of: [completed], timeout: 2)
      XCTAssertEqual(events, ["snapshot", "review", "recovery"])
      XCTAssertFalse(gate.inProgress)
    }
  }

  @MainActor
  func testCancelAndSnapshotFailureKeepRecoveryAndAllowRetry() async {
    for snapshotAccepted in [true, false] {
      let gate = TerminationReviewGate()
      let completed = expectation(description: "cancelled")
      gate.begin(
        preparations: [{ done in done(snapshotAccepted) }],
        review: { done in
          XCTAssertTrue(snapshotAccepted)
          done(false)
        },
        finishRecovery: { XCTFail("cancel/failure must retain recovery") },
        reply: { approved in
          XCTAssertFalse(approved)
          completed.fulfill()
        })
      await fulfillment(of: [completed], timeout: 2)
      XCTAssertFalse(gate.inProgress)
    }
  }
}
