Beast Kingdom Online — game server (Colyseus)

DirectAdmin → Setup Node.js App:
  Application root      bko-server          (upload this folder there, OUTSIDE public_html)
  Application URL       game.appkhun.com/ws
  Startup file          app.js
  Node version          18+

Environment variables to add in the same screen:
  BKO_BASE_PATH  /ws                        (must match the Application URL path)
  BKO_DATA       /home/appkhunc/bko-data    (character saves; create the folder first)

Then: Run NPM Install → Start. PORT is set by the panel, do not add it yourself.

Check it is alive (from anywhere):
  curl -X POST -H 'content-type: application/json' -d '{}' https://game.appkhun.com/ws/matchmake/joinOrCreate/map
  A JSON reply (even an error about a token) means the mount works; 404 means the URL path
  and BKO_BASE_PATH disagree.
