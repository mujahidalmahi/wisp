# Prompt Spec: Grounded Post-Watch Trivia Generator (`post_watch_quiz`)

## Goal
Generate a 4-option multiple-choice question grounded exclusively in the scenes and facts the viewer has already watched (`00:00 -> playbackPositionMs`).

## JSON Contract (`quizPayload`)
```json
{
  "question": "What caused the argument between Thom and Celia on the Amsterdam bridge?",
  "options": [
    "Celia's robotic hand enhancement and desire to go to space",
    "A missing encrypted telegraph cipher",
    "A malfunction in the Oude Kerk turret grid",
    "A disagreement with Captain Barley"
  ],
  "correctIndex": 0,
  "explanation": "On the bridge, Thom expressed fear over Celia's new cybernetic hand and her ambition to leave Earth."
}
```
