import { classifyDecline } from "./declineClassifier";

console.log(
  "insufficient_funds:",
  classifyDecline("insufficient_funds")
);

console.log(
  "bank_network_downtime:",
  classifyDecline("bank_network_downtime")
);

console.log(
  "expired_blocked_card:",
  classifyDecline("expired_blocked_card")
);

console.log(
  "customer_cancelled_mandate:",
  classifyDecline("customer_cancelled_mandate")
);

console.log(
  "other_unclassified:",
  classifyDecline("other_unclassified")
);