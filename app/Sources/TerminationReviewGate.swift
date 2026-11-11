import Foundation

@MainActor
final class TerminationReviewGate {
  typealias Prepare = (@escaping (Bool) -> Void) -> Void
  private(set) var inProgress = false

  @discardableResult
  func begin(
    preparations: [Prepare], review: @escaping (@escaping (Bool) -> Void) -> Void,
    finishRecovery: @escaping () -> Void, reply: @escaping (Bool) -> Void
  ) -> Bool {
    guard !inProgress else { return false }
    inProgress = true
    var finished = false
    func finish(_ allowed: Bool) {
      guard !finished else { return }
      finished = true
      if allowed { finishRecovery() }
      inProgress = false
      reply(allowed)
    }
    func prepare(_ remaining: ArraySlice<Prepare>) {
      guard let first = remaining.first else {
        review(finish)
        return
      }
      var responded = false
      first { accepted in
        guard !responded, !finished else { return }
        responded = true
        guard accepted else {
          finish(false)
          return
        }
        prepare(remaining.dropFirst())
      }
    }
    DispatchQueue.main.async { prepare(preparations[...]) }
    return true
  }
}
