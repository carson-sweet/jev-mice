# Epic EP-10 quotas public mode operations
#
# Generated from jev-mice-user-stories v1.0. Do not edit by hand: edit the story
# and regenerate, so a scenario and the story it came from cannot drift apart.
#
# Step definitions are pending. These scenarios exercise the hosted service, which
# does not exist yet, so they are specifications rather than runnable tests. They
# become runnable as each stage of the implementation sequence lands.

Feature: US-E10-01 A daily budget I can see

  As a person using the product
  I want to know how much of today's budget I have left
  So that a run does not stop being interesting halfway through for a reason I cannot see

  # Satisfies FR-117, FR-118, FR-120, FR-123.

  Scenario: Remaining budget is always visible
    Given I am signed in
    Then the header shows my remaining budget as a bar with numbers beside it

  Scenario: A run that will not fit offers a way forward
    Given a run estimated at 8.9 million tokens and 2.1 million left
    When I try to start it
    Then I am offered a code-only run, a shorter run that fits, or waiting for the reset

  Scenario: Owners are unlimited
    Given an allowlisted owner
    Then no per-subject budget applies and the header says so

  Scenario: Usage is recorded per chunk, not per call
    Given a run of 8 chunks
    Then 8 usage records exist, each carrying the tokens and cost the service reported

Feature: US-E10-02 Budgets that cannot be sidestepped

  As the operator
  I want limits that survive a cleared cookie
  So that one visitor cannot drain the deployment

  # Satisfies FR-118, FR-119, FR-125.

  Scenario: Every applicable budget is consulted
    Given an anonymous visitor whose session budget has room but whose address budget does not
    When the next allowance is requested
    Then it is refused and the refusal names the address budget

  Scenario: Clearing a cookie does not reset the budget
    Given an anonymous visitor who has spent today's budget
    When they clear their cookie and return
    Then the address budget still applies and they do not get a fresh allowance

  Scenario: The deployment budget stops everyone gracefully
    Given the deployment's daily cost budget is spent
    Then every run continues on code-only rules and each says why and when the budget resets

Feature: US-E10-03 Public mode

  As the operator
  I want to open the deployment without accounts
  So that anyone can try it without signing up

  # Satisfies FR-124 to FR-128. Verifies SM-16.

  Scenario: No sign-in exists in public mode
    Given authentication is switched off
    When I open the app
    Then I land on the configuration screen, no sign-in route is reachable, and nothing links to one

  Scenario: An anonymous visitor can run a simulation
    Given public mode
    Then I can configure and run a simulation under the anonymous budgets

  Scenario: Sharing is unavailable
    Given public mode
    Then no share action appears anywhere and attempting one is refused

  Scenario: An anonymous run expires within a day of its expiry
    Given an anonymous run created 24 hours ago
    When the sweep runs after its expiry
    Then the run, its chunks, segments, snapshot and usage records are gone from every store

Feature: US-E10-04 Delete my account

  As a person with an account
  I want leaving to remove everything
  So that I can stop using the product without leaving a trace behind

  # Satisfies FR-131 to FR-133. Verifies SM-14.

  Scenario: What will be removed is counted before I confirm
    When I choose to delete my account
    Then I am shown how many runs, share links and usage records will go, and told my shared links will stop working

  Scenario: Deletion requires typing the word
    Given the confirmation dialog
    Then the delete action stays disabled until I type the word the interface names

  Scenario: Everything goes, in every store
    When I confirm
    Then my profile, every run, chunk, summary segment, snapshot, share link, usage record and coordinator state is removed, and my sessions on every device stop working

  Scenario: Unreachable storage changes nothing
    Given the object store is unreachable
    When I confirm deletion
    Then nothing is removed and I am told to try again

Feature: US-E10-05 Know when something is wrong

  As the operator
  I want to hear about the two failures that are silent
  So that I do not learn from a visitor that the product is broken

  # Satisfies FR-138, FR-139, NFR-012, NFR-005. Verifies SM-10.

  Scenario: Sign-in failures raise an alert
    Given more than one sign-in in ten fails over fifteen minutes
    Then an alert is raised

  Scenario: A silent slide to code-only rules raises an alert
    Given more than half of decisions fall back over fifteen minutes
    Then an alert is raised

  Scenario: A daily line summarises the deployment
    Given a day has passed
    Then one message reports runs started, completed and failed, the fallback rate, spend, storage used and the queue high-water mark

  Scenario: No secret reaches a browser or a response
    Given the built bundle and every route
    Then neither contains anything matching a key pattern, checked in the build and in tests

  Scenario: Errors reach one place from all three runtimes
    Given an error in the browser, in the service and in a simulation
    Then all three are reported, and the browser's goes through this service rather than to a third party

