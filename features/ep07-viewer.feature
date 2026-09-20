# Epic EP-7 viewer
#
# Generated from jev-mice-user-stories v1.0. Do not edit by hand: edit the story
# and regenerate, so a scenario and the story it came from cannot drift apart.
#
# Step definitions are pending. These scenarios exercise the hosted service, which
# does not exist yet, so they are specifications rather than runnable tests. They
# become runnable as each stage of the implementation sequence lands.

Feature: US-E07-01 Watch a run live

  As a watcher
  I want to see the colony moving as it is simulated
  So that the behaviour is something I observe rather than read about

  # Satisfies FR-064, FR-067, FR-141, NFR-002, NFR-014. Verifies SM-08, SM-17.

  Scenario: The current state arrives before any frame
    Given a run in progress
    When I connect
    Then I receive the current world state within 2 seconds and then frames

  Scenario: The state comes from the running simulation
    Given a run whose last chunk was written 100 seconds ago
    When I connect
    Then the state I receive reflects the current tick, not the tick of the last stored snapshot

  Scenario: Every kind is distinguishable without colour
    Given the grid rendering
    Then mice, cats, traps, occupied traps, food and mouseholes differ in shape as well as colour, and each mouse's nutrition band is visible

  Scenario: The meter is always visible
    Given a run in progress
    Then the current tick, ticks per second, requests, tokens and cost are shown and update as the run proceeds

  Scenario: The meter does not lag the true total
    Given a run that has completed 5 chunks
    Then the cost shown differs from the recorded total by at most one chunk's worth

  Scenario: A default run stays under the cost ceiling
    Given a 2,000-tick Medium run at default settings whose population stays near its starting size
    Then its recorded cost is under fifty cents at the configured price

Feature: US-E07-02 Inspect an animal's decision

  As an evaluator
  I want to see exactly what the model was asked and exactly what it answered
  So that I can tell judgement from a script

  # Satisfies FR-058, FR-065. Verifies SM-02.

  Scenario: The panel shows the decision end to end
    Given a run in progress
    When I click a mouse
    Then I see its identity, sex, personality, nutrition, age, whether it is sheltering, its memories with their seen or heard tags, and its latest decision: the state sent, every question asked, every probability and confidence returned, the fear level, the derived weights, the resulting move, and that decision's tokens and cost

  Scenario: Nothing is reworded between the service and the screen
    Given a decision the model answered
    Then the state shown is the state sent, verbatim, and the probabilities shown are the probabilities returned, unrounded

  Scenario: A low-confidence answer is flagged
    Given a decision whose drive confidence is 0.44
    Then the intent is shown with a low-confidence flag

  Scenario: A code-only decision says so
    Given a decision answered by the code-only rules
    Then the panel names the rules that answered instead of showing a distribution

  Scenario: The panel follows the animal
    Given the panel open on a mouse
    When that mouse makes a new decision
    Then the panel updates without my clicking again

  Scenario: In replay the panel matches the scrubber
    Given a replay at tick 1,204
    Then the panel shows the decision current at tick 1,204 and never one from another tick

Feature: US-E07-03 Reconnect without losing my place

  As a watcher
  I want a dropped connection to recover on its own
  So that a flaky network does not cost me the run

  # Satisfies FR-092, FR-141. Verifies SM-17.

  Scenario: A dropped connection recovers
    Given I am watching a run
    When the connection drops and is restored
    Then I receive a fresh state and frames resume, without reloading the page

  Scenario: The run is unaffected
    Given my connection dropped for 60 seconds
    Then the run advanced during that time and never paused

  Scenario: Reconnecting is the same path as connecting
    Given a reconnect, a first connection and a late join
    Then all three receive the current state and then frames, by the same route

Feature: US-E07-04 Read the charts

  As a watcher
  I want the charts to cover the whole run from its first tick
  So that joining late does not cost me the history

  # Satisfies FR-066, FR-100.

  Scenario: Seven series are shown
    Given a run in progress
    Then the view shows population by sex and personality, mice sheltering, deaths by cause, mean nutrition, mean fear, decisions per tick, and cumulative cost

  Scenario: Charts cover the whole run even on a late join
    Given a run at tick 1,500
    When I connect for the first time
    Then the charts show ticks 1 to 1,500, assembled from the stored summary segments

  Scenario: Charts continue as the run proceeds
    Given I am watching
    Then each series extends as new segments are written

