# Jira project setup

**Story:** SCRUM-7 · Sprint 1 · Tareq Haque

How the SCRUM project in Jira is configured, so the board matches the way the team
actually works and so every story carries the evidence the course requires.

## Project

- **Type:** Scrum (team-managed)
- **Key:** `SCRUM`
- **Board:** one board, one active sprint at a time, Sprints 1–12

## Workflow

Three states only. Anything more was overhead for a team of four.

```
To Do  →  In Progress  →  Done
```

A story moves to **In Progress** when someone starts it and logs the first worklog, and
to **Done** only when its acceptance criteria are all met *and* its final worklog links
the evidence (see below). There is no separate review column — review happens in the
GitHub pull request, and the story stays In Progress until that PR merges.

## The Acceptance Criteria field

Jira's default Story screen has no acceptance-criteria field, so one was added:

| Property | Value |
| --- | --- |
| Field name | `Acceptance Criteria` |
| Type | Paragraph (supports rich text) |
| Position | Immediately **after** Description |
| Required | Yes, on **Story** |
| Issue types | Story (not Subtask — subtask criteria live in the description) |

Required-on-Story is deliberate: it makes it impossible to open a story without saying
what "done" means for it. Criteria are written as a bulleted list, one checkable
statement per line.

## Evidence rule

Every story must have **at least one worklog**, and its **final worklog** must link the
work product:

- a commit or pull request on `github.com/Tamars252/Team09_SubletU`, or
- a path under `/docs`, or
- a Jira artifact (for ceremony subtasks, the table in the subtask description)

This is what makes the board auditable after the fact rather than a list of assertions.

## Sprint Ceremonies epic

Each sprint carries one **Sprint N Report** story with exactly four subtasks:

1. **SCRUM 1** — first 15-minute stand-up; attendance plus a table
   `| Team Member | Have Done | Plan To Do | Roadblocks |`
2. **SCRUM 2** — second stand-up, second half of the sprint, same table
3. **Sprint Review** — outcomes, demo notes, why anything rolled over, worklog links verified
4. **Retrospective** — attendance plus
   `| Team Member | Went Well? | Could be Better? | How could be fixed? | Specific Actions |`

The Sprint Report story is closed **before** the sprint is completed, so it never rolls
over into the next sprint.

## SCRUM Master Schedule

`SCRUM-1` is a story that **stays in the backlog permanently** — it is never added to a
sprint. Its description holds the rotation table, one row per sprint:

| Sprint | Scrum Master |
| --- | --- |
| 1 | Tareq Haque |
| 2 | Tamar Shuster |
| 3 | Chris Martinez |
| 4 | Team Member 4 |
| 5 | Tareq Haque |
| 6 | Tamar Shuster |
| 7 | Chris Martinez |
| 8 | Team Member 4 |
| 9 | Tareq Haque |
| 10 | Tamar Shuster |
| 11 | Chris Martinez |
| 12 | Team Member 4 |

Names must match Jira display names exactly so the table can be cross-checked against
assignees.

## Estimation

Fibonacci story points (1, 2, 3, 5, 8). Ceremony stories are a flat 2; subtasks are not
pointed, so a sprint's velocity reflects product work rather than meeting overhead.
