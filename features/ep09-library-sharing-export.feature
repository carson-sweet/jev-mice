# Epic EP-9 library sharing export
#
# Generated from jev-mice-user-stories v1.0. Do not edit by hand: edit the story
# and regenerate, so a scenario and the story it came from cannot drift apart.
#
# Step definitions are pending. These scenarios exercise the hosted service, which
# does not exist yet, so they are specifications rather than runnable tests. They
# become runnable as each stage of the implementation sequence lands.

Feature: US-E09-01 Keep a library of runs

  As a watcher
  I want my runs to follow me between machines
  So that I can compare something I ran last week against something I ran today

  # Satisfies FR-105, FR-106, FR-135.

  Scenario: My runs are listed newest first
    Given I have six runs
    Then the library shows each with its status, progress, preset, decision source, cost, creation time and expiry, newest first

  Scenario: My runs follow me
    Given I created a run on one machine
    When I sign in on another
    Then the run is in my library

  Scenario: I see only my own runs
    Given another person has runs
    Then none of them appears in my library and none is reachable by guessing an identifier

  Scenario: A run close to expiry is badged
    Given a run expiring in 4 days
    Then the library badges it

  Scenario: Renaming and deleting work from the list
    When I rename a run
    Then the new name is shown
    When I delete a run
    Then it is gone along with its chunks, segments, snapshot and any share links

Feature: US-E09-02 Share a run by link

  As an evaluator
  I want to be sent a link and see the run without signing up
  So that evaluating the product does not start with creating an account

  # Satisfies FR-111 to FR-116. Verifies SM-18.

  Scenario: An owner creates a link and sees it once
    Given a completed run
    When I create a share link
    Then the full link is shown once and only a hash of it is stored

  Scenario: Anyone with the link can watch and replay
    Given a share link and no account
    When I open it
    Then I can watch or replay the run, including the inspector, and can locate the chunk holding any tick

  Scenario: A share viewer cannot change anything
    Given I am viewing through a share link
    Then no control, delete, export or share action is available to me, and sending one anyway is refused

  Scenario: Revoking stops the link immediately
    Given a share link someone is holding
    When the owner revokes it
    Then the next request with it is refused

  Scenario: Deleted, expired and revoked look the same
    Given three links whose runs were deleted, expired and revoked
    Then all three return the same not-found response, so the link cannot be used to learn what exists

Feature: US-E09-03 Export a run to keep it

  As a researcher
  I want to take a full record away
  So that a result survives the thirty-day retention

  # Satisfies FR-108, FR-110.

  Scenario: The size is stated before the download starts
    Given a run of 8 chunks totalling 41 megabytes
    When I open export
    Then the size is shown before I begin

  Scenario: A full record exports as one archive
    When I export the full record
    Then I receive one archive containing the configuration, every summary segment and every chunk

  Scenario: An interrupted export can be restarted
    Given an export interrupted part way
    When I start it again
    Then it completes and nothing server-side has changed

Feature: US-E09-04 Runs expire predictably

  As the operator
  I want storage to be bounded
  So that the deployment does not grow without limit

  # Satisfies FR-126, FR-135 to FR-137, NFR-015.

  Scenario: A signed-in run is kept thirty days
    Given a run created 31 days ago belonging to a person who is not an owner
    When the sweep runs
    Then the run, its chunks, segments, snapshot, share links and usage rows are gone

  Scenario: An owner's runs do not expire
    Given a run belonging to an allowlisted owner
    Then it has no expiry and the sweep leaves it alone

  Scenario: A failed object deletion is retried until it succeeds
    Given an object whose deletion fails
    Then it is recorded and retried, and no row points at an object that no longer exists

