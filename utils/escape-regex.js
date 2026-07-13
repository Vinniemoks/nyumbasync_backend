// Escape user-supplied text before using it in a RegExp or a Mongo $regex
// query. Raw user input in a regex enables regex injection and ReDoS
// (catastrophic backtracking) — see assessment H18.
module.exports = function escapeRegex(input) {
  return String(input == null ? '' : input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
