# Epic EP-5 run lifecycle and capacity
#
# Generated from jev-mice-user-stories v1.0. Do not edit by hand: edit the story
# and regenerate, so a scenario and the story it came from cannot drift apart.
#
# Step definitions are pending. These scenarios exercise the hosted service, which
# does not exist yet, so they are specifications rather than runnable tests. They
# become runnable as each stage of the implementation sequence lands.

Feature: US-E05-01 One run at a time

  As the operator
  I want each person to have one run in progress
  So that one person cannot occupy the deployment

  # Satisfies FR-083 to FR-085, FR-090.

  Scenario: A second start is refused with a way forward
    Given I have a run in progress
    When I start another
    Then I am told which run is in progress and offered to watch it, stop it and start the new one, or cancel

  Scenario: A double submission creates one run
    Given I submit the same new run twice in quick succession
    Then exactly one run is created

  Scenario: Terminal status is final
    Given a completed run
    When a late report arrives for it
    Then the report is discarded and recorded, and the run's totals do not change

Feature: US-E05-02 Queue when the deployment is full

  As a watcher
  I want to wait in line rather than be turned away
  So that a busy moment costs me time instead of my run

  # Satisfies FR-086 to FR-089.

  Scenario: A run beyond capacity is queued with a position
    Given 20 simulations already running
    When I start a run
    Then it is queued and I am shown my position

  Scenario: A queued run starts on its own
    Given my run is queued at position 1
    When a running simulation finishes
    Then mine starts without my doing anything

  Scenario: Leaving does not lose my place
    Given my run is queued
    When I close the tab and return later
    Then the run is either still queued or has started

  Scenario: I can cancel while queued
    Given my run is queued
    When I cancel it
    Then it is removed and I can configure another

Feature: US-E05-03 Control a running simulation

  As a watcher
  I want pause, step, speed and stop to take effect when I press them
  So that I can examine a moment rather than chase it

  # Satisfies FR-006, FR-068, FR-084.

  Scenario: Pause takes effect at the next tick
    Given a run in progress
    When I press pause
    Then the simulation stops advancing within one tick, not at the next chunk boundary

  Scenario: Step advances exactly one tick
    Given a paused run at tick 612
    When I press step
    Then the run is at tick 613 and paused again

  Scenario: Stop is terminal and keeps the record
    Given a run at tick 900 of 2,000
    When I confirm stop
    Then the run's status becomes cancelled and everything recorded up to tick 900 remains readable

  Scenario: A viewer without control cannot control
    Given someone watching through a share link
    When they send a control command
    Then it is refused

