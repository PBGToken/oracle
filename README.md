# multi-sig-oracle-client
Multi Signature Oracle Client for PBG Token price feeds

Though we (will soon) integrate with Orcfax price feeds, we must still maintain our own multi-sig infrastructure for price feed updates as we need a fallback in case there are problems with Orcfax.

A secondary reason is that our own multi-sig oracle infrastructure can be used in conjunction with Orcfax, to increase our Nakamoto coefficient by at least 1 (1 externally verifiable, 2 or more internally verifiable).

The oracle client is a progressive web app, that can be installed on a (spare) mobile phone, and left to run in the background.