# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Strava itself (report its vulnerabilities to Strava).

## Credentials

The integration stores the Strava Client Secret (a `secret` field, never sent
back to the browser) and the OAuth2 tokens of the linked account in the Gladys
configuration, and never logs them. A report showing a token or a secret
leaking (logs, widget, scene variable, Docker image) is in scope.

Revoke the access of the integration at any time from
<https://www.strava.com/settings/apps>, or with the **Unlink the Strava
account** action of the Configuration screen.
