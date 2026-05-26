# Analysis Demo Flow

## Goal

Help a hackathon judge understand in under 30 seconds that DeepSignal is a signal intelligence workspace, not a form response viewer.

## Recommended flow

1. Open `/#/dev/insights-fixture`.
2. Seed `Combined Analysis Workspace`.
3. Open `/#/dashboard?tab=insights&scope=all`.
4. Start from the top analysis summary.
5. Call out `What happened`, `Why it matters`, `Urgency level`, and `Recommended next action`.
6. Scroll once to show `Urgency Score`, `Top Themes`, `Anomaly Signals`, `Evidence Signals`, and `Location Cluster`.
7. Switch to `Review` and show that each row is rendered as a signal card with urgency, signal type, analyst type, evidence, and next action.

## Talk track

- `Tokyo Earthquake Demo` shows disaster analysis with clustered locations, urgent help demand, contradictory safety states, and response gaps.
- `Internal Risk Demo` shows emotional internal reporting, escalation pressure, and team-level clustering.
- `Product Feedback Demo` shows repeated friction, strong sentiment, anomaly detection, and product opportunity.
- The important point is that operators are not reading raw responses first. DeepSignal lifts the most important signals, explains why they matter, and suggests the next move.

## Fallback note

This demo uses browser-local fixture data only. Walrus, Sui, and external AI calls are not required for the analysis UI to appear.
