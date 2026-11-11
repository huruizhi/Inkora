import Sparkle
let comparator = SUStandardVersionComparator.default
precondition(comparator.compareVersion("4", toVersion: "5") == .orderedAscending)
precondition(comparator.compareVersion("5", toVersion: "4") == .orderedDescending)
print("PASS real Sparkle 2.10.0 version comparator (hostless CLI, no updater start)")
