# Epic EP-6 records replay comparison
#
# Generated from jev-mice-user-stories v1.0. Do not edit by hand: edit the story
# and regenerate, so a scenario and the story it came from cannot drift apart.
#
# Step definitions are pending. These scenarios exercise the hosted service, which
# does not exist yet, so they are specifications rather than runnable tests. They
# become runnable as each stage of the implementation sequence lands.

Feature: US-E06-01 Replay a stored run

  As a researcher
  I want to replay a finished run exactly
  So that I can examine what happened without paying to run it again

  # Satisfies FR-062, FR-102, FR-103. Verifies SM-03.

  Scenario: Replay makes no decision calls
    Given a stored run
    When I replay it from start to finish
    Then no request is made to the decision service

  Scenario: Replay reproduces the stream
    Given a stored run
    When I replay it
    Then the events match the stored stream exactly, excluding the declared wall-clock fields

  Scenario: A failed run replays as far as it got
    Given a run that failed at tick 7,410
    Then replay covers ticks 1 to 7,410 and the scrubber ends there

Feature: US-E06-02 Scrub to any tick

  As a watcher
  I want to jump to the moment things went wrong
  So that I do not watch an hour to see one minute

  # Satisfies FR-062, FR-102, NFR-011.

  Scenario: Jumping loads only what is needed
    Given a 20,000-tick run of 80 chunks
    When I scrub to tick 12,340
    Then only the chunk containing that tick is fetched

  Scenario: A chunk that fails to load is retryable
    Given a chunk that fails to download
    Then playback pauses at the boundary, the range is named, and a retry is offered

  Scenario: Clicking a chart moves the scrubber
    Given the deaths-by-cause chart
    When I click the point where the line turns upward
    Then the scrubber moves to that tick

Feature: US-E06-03 Compare two runs

  As a watcher
  I want to put two runs side by side
  So that changing one setting becomes an experiment rather than an impression

  # Satisfies FR-063. Verifies SM-04.

  Scenario: Differences are highlighted
    Given two runs differing only in personality mix
    When I compare them
    Then the personality mix row is highlighted and every other row is not

  Scenario: Seed equality is called out
    Given two runs with the same seed
    Then the comparison states that they started in identical worlds

  Scenario: A differing seed is called out too
    Given two runs with different seeds
    Then the comparison warns that outcomes cannot be attributed to the differing setting alone

  Scenario: Series are distinguishable without colour
    Given two runs overlaid on one chart
    Then each series is distinguishable by line pattern as well as by colour

