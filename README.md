Open the webpage at https://joj-jh.github.io/puzzleparty.

Todo:
- ~~Connect/disconnect button logic~~
  - ~~Leave room option~~
  - ~~Only show when valid inputs~~
  - ~~Validation highlighting (ensuring username is not blank)~~
  - ~~Store username from previous sessions~~
- Switch out to nostr version of trystero (torrent version is failing for me)
- ~~Hide stuff until connection is made (looks bad)~~
- Make sure current system initiates syncing of messages properly
- Is global messaging method okay? Or should a designated host act as single source of truth?
  - No concurrency conflict issues, but single point of failure
  - UTC usage is stinky as hell, probably very brittle
    - Check time difference when a user joins and then notify them if they are lagging/leading
- ~~Add scrolling to grid~~
  - ~~Sticky header~~
- ~~Enable selecting and editing cells~~
- Incremental rendering updates instead of refreshing whole table
- ~~Stats (wins, ao5, mean etc.)~~
- Password protected rooms
- Url route parameters for link sharing
- Custom indicator sounds on new scramble
- Mobile support
- Timing options
  - ~~Inspection~~
  - Spacebar/input/touchscreen tap
- Favicon
- ~~View old scrambles~~
  - ~~Cell select for number?~~
- Fix big cube scrambles (need more parameters?)

