# Epic EP-8 accounts and sign in
#
# Generated from jev-mice-user-stories v1.0. Do not edit by hand: edit the story
# and regenerate, so a scenario and the story it came from cannot drift apart.
#
# Step definitions are pending. These scenarios exercise the hosted service, which
# does not exist yet, so they are specifications rather than runnable tests. They
# become runnable as each stage of the implementation sequence lands.

Feature: US-E08-01 Sign in with Google

  As a watcher
  I want to sign in with an account I already have
  So that I can keep my runs without creating another password

  # Satisfies FR-075 to FR-078, FR-080, FR-082.

  Scenario: Signing in creates an account with four fields
    Given I have never signed in
    When I complete Google sign-in
    Then an account is created holding my Google identifier, email, name and avatar, and nothing else about me

  Scenario: What is stored is disclosed before I sign in
    Given the sign-in screen
    Then it states what is stored and that runs are kept 30 days, before I press anything

  Scenario: Only three scopes are requested
    When sign-in begins
    Then the request asks for openid, email and profile and no other scope

  Scenario: A cancelled sign-in creates nothing
    When I cancel at the Google screen
    Then no account exists and I am told the attempt can be retried

  Scenario: A session expires thirty days after it is issued
    Given a session issued 30 days ago and used daily since
    Then it is expired, because the lifetime does not extend with use

Feature: US-E08-02 See and export what is stored about me

  As a person with an account
  I want to see everything the product holds about me
  So that I can judge whether I am comfortable with it

  # Satisfies FR-129, FR-130, NFR-006.

  Scenario: The account screen lists everything
    Given I open my account
    Then I see my Google identifier, email, name and avatar, and a statement that this is the complete list

  Scenario: My data exports as one file
    When I export my data
    Then I receive one file containing my profile, the details of every run, and my usage history

  Scenario: No tracking is present
    Given any page served to me
    Then it contains no third-party script, pixel or fingerprinting, including for error reporting

Feature: US-E08-03 Sign out everywhere

  As a person with an account
  I want to end my sessions on every device
  So that signing out on a shared machine actually signs me out

  # Satisfies FR-079, FR-132, FR-146. Verifies SM-14.

  Scenario: Signing out ends this session
    When I sign out
    Then my session no longer authenticates

  Scenario: Signing out everywhere ends the others
    Given I am signed in on two devices
    When I sign out everywhere from one
    Then the session on the other no longer authenticates

  Scenario: A session whose account is gone fails closed
    Given a session whose account has been deleted
    When a request arrives with it
    Then the request is unauthenticated and the session is cleared

