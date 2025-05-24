# multi-sig-oracle-client

Multi Signature Oracle Client for PBG Token price feeds.

Though we (will soon) integrate with Orcfax price feeds, we must still maintain our own multi-sig infrastructure for price feed updates as we need a fallback in case there are problems with Orcfax.

A secondary reason is that our own multi-sig oracle infrastructure can be used in conjunction with Orcfax, to increase our Nakamoto coefficient by at least 1 (1 externally verifiable, 2 or more internally verifiable).

## Installing

Installation steps:

1. Go to `https://pbgtoken.github.io/oracle`
2. Optionally you can install this app as a PWA on your smart phone:
   - iOS: open site with Safari, and in the share menu, look for a button named 'Add to home screen'
   - Android: open with any browser, and in the main menu, look for a button named 'Install to home screen' or similar
3. Configure your private key using 24 words
4. Configure your AWS account keys
5. Click 'Push validator'

## AWS access keys

1. Create an AWS account
2. Login
3. Look for 'IAM'
4. Go to 'Users'
5. In the summary panel, below Access key 1, click 'Create access key'
6. Under use-cases, selected 'Third-party service'
7. Confirm that you understand the recommendation, and click 'Next'
8. As a description, write 'PBG Oracle'
9. Click 'show' under secret access key
10. Note the access key and secret access key in a safe place

## History

The PBG oracle app has seen several iterations:

1. Progressive Web App (PWA) with a service-worker continuously runs, and uses the WebPush API to get notified when transactions must be signed. Disadvantages:
    - Doesn't work on iOS because background-processes are severely throttled
    - Only reliably works on Android using Firefox, but even there, after two weeks of inactivity, the background-process is throttled
    - WebPush API has a typical latency of 10 seconds
2. Android native app which continously polls for transactions to be signed. Disadvantages:
    - Phone still needs to be charging 100% of the time, which is a strain on the battery (my phone battery become swollen after 6 months of continuous charging)
    - A large amount of code needs to duplicated in Java
3. Current: PWA that pushes JavaScript to a AWS serverless function (other cloud providers will be implemented later), and registers the URL of the serverless function with the PBGToken backend. The serverless function handles transaction validation and signing.