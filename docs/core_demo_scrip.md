# Ghostfolio AI Chat Demo Script

This demo tells one simple story.
The user has a real money problem.
The system understands the question, runs the right tools, checks the result, and answers clearly.

I start with this line.
I built a finance AI chat assistant inside Ghostfolio.
It helps people make safer portfolio decisions with tool-backed answers, verification checks, and confidence scores.

Now I ask the main question.
My portfolio is too concentrated. What should I do?

I explain the flow while the answer appears.
First, the router reads the intent.
Second, policy decides which tools are safe and useful.
Third, tools run and return structured data.
Fourth, verification checks that data before we respond.
Last, the final answer is rendered in human language with confidence and citations.

I point to the tool calls.
For this question, we use portfolio analysis and risk assessment.
When action intent is clear, we add rebalance planning.
This matters because we do not guess.
We show exactly what was executed.

I point to verification and confidence.
The system checks numerical consistency, tool execution, citation coverage, and response quality.
If confidence is low and evidence is weak, we abstain and ask for clearer scope.
This is important in finance because a wrong confident answer is worse than a careful answer.

Now I show typo robustness with short prompts.
I run porftolio too consentrated.
I run too much in one stock.
I run trim overwaight positions.
I run wats my risk.
I explain that these are in our eval set, so this is tested behavior and not a lucky demo moment.

Then I show one multi-step example.
Analyze portfolio risk, check AAPL price, then propose rebalance.
I explain that the orchestrator chains tools in one pass and keeps output structured.

Now I explain tradeoffs in plain words.
We start with deterministic routing because it is fast, cheap, and easy to audit.
The tradeoff is phrasing brittleness.
To reduce that, we add normalization, typo recovery, policy fallback, and eval regressions.
If scale or language variability grows, we can move to embedding-based intent classification.
We chose reliability now, then smarter routing later.

I explain architecture in one breath.
The architecture is Reasoning Engine, Tool Registry, Policy Gate, Verification Layer, Memory, and Observability.
This separation keeps behavior clear and debuggable.
It also makes regulated use cases easier to defend.

I close with proof.
Our eval framework covers happy path, edge cases, adversarial prompts, and multi-step flows.
We track pass rate, hallucination rate, verification accuracy, and latency.
The goal is not a flashy chatbot.
The goal is a dependable financial assistant you can trust in production.

I end with this line.
Ghostfolio AI chat is cool because it is not magic.
It is controlled reasoning with tools, checks, and evidence.
