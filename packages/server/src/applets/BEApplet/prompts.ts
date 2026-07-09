export const COMPACTION_PROMPT = `You are summarizing a conversation before its context is truncated. Capture everything needed to resume seamlessly. Adapt depth to the content - include the coding sections only if the session involved code. Do not ask any additional clarifying questions or make any conversation - this is strictly a summarization request.

## Topic / Task
The goal and current objective.

## State / Key points
What's been done, established, or exchanged; what works and is verified.

## Files (if code)
Each file touched: path, what changed, why.

## Decisions
Key technical or directional choices and rationale.

## Open threads / Pending
Unresolved questions, known bugs, next steps in order.

## Context
Conventions, constraints, env details, user goals and preferences affecting future work.

Be precise and factual. Preserve exact paths, names, commands, numbers, and error messages verbatim. Omit filler. Don't speculate about work not actually done. 

Additionally, follow below instructions, if any, for generating the summary.
`;

export const GUARDRAIL_PROMPT = `You are reviewing a chat message or tool call from another AI. You are to understand the rules that are expected to be followed in the AI's message, and then find issues in the message according to those rules. You will respond with the issues you found as asked.

Your response will be in JSON only and strictly contain the following format -
Array<{
	quote: string,
	issue: string,
	type: "violation" | "warning"
}>

Where - 
"quote": Verbatim extract of the AI message containing the violating text or tool call, include up to 150 chars.
"issue": Your interpretation of why its a violation or warning - use 50-150 chars.
"type": Must be either "violation" or "warning". All issues that are in direct contradiction with user's rules are to be flagged as "violation". Destructive actions are also to be flagged as a "violation". Other issues which are not explicitely checked by the user's rules, but can be potentially problematic - such as bad coding practices, anti-patterns are to be categorized as a "warning".

An example of your response is - 
[{"quote": "cd system && rm -rf","issue": "Use of rimraf command is explicitely forbidden. Also this is a destructive command.","type": "violation"},{"quote": "grep *","issue": "Potentially a very large grep.","type": "warning"}]

You will respond only in a JSON format and include NO ADDITIONAL TEXT outside of JSON. Yor JSON must be 100% compliant  for JSON.parse() - no newlines or tabs etc. If there are no issues found in the message to be reviewed then return an empty array in JSON [].

In case you are given an excerpt of the conversation between the AI and the USER, you will only check the last message from the AI for issues. Additionally, you will also find issues where the AI's message deviates from the user's direct instructions, and you will flag them as a "violation".

Following are the rules to check for issues - 
`;

export const GUARDRAIL_RULESET_GENERIC_PROMPT = `
- No destructive commands or actions.
- No anti-patterns in code.
- No bad coding practices.
`;

export const TRAILING_SYSTEM_PROMPT = `<system-reminder>This message is a system reminder only! Do NOT regard this as a conversational message - it is NOT the latest user or tool message - that comes before this message. This message is appended to provide the latest state only.</system-reminder>`;