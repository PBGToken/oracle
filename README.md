# multi-sig-oracle-client

Multi Signature Oracle Client for PBG Token price feeds

Though we (will soon) integrate with Orcfax price feeds, we must still maintain our own multi-sig infrastructure for price feed updates as we need a fallback in case there are problems with Orcfax.

A secondary reason is that our own multi-sig oracle infrastructure can be used in conjunction with Orcfax, to increase our Nakamoto coefficient by at least 1 (1 externally verifiable, 2 or more internally verifiable).

The oracle client is a progressive web app, that can be installed on a (spare) mobile phone, and left to run in the background.

## iOS

Activate web push notifications in Safari dev settings

## Android

Prefer Firefox (it seems that Mobile Google Chrome sometimes creates Web Push API endpoints that aren't valid)

How to overcome unacknowledged notification limit? (seems to be around 50, after which the service worker can no longer run???)

Use Firefox Nightly for Developers, and in about:config set dom.push.maxQuotaPerSubscription to 2000000000 (2 billion)

This way, once the notifications saturate, the push messages keep arriving to the service worker.
### Android 12

Disable battery optimization: Settings > Apps > See all # apps > Browser used for PWA > Battery > Select "Unrestricted"

Enable developer options: Settings > About phone > Tap Build number 7 times

Use developer options to enable Stay Awake: Settings > System > Developer options> Stay awake

### Android 14

## Desktop browsers
