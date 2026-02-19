# Videochat Tack

## Overview

Videochat Tack is a browser-based real-time video chat application that
allows users to join themed rooms and communicate using audio and video
directly from their browser.

Live App: https://videochat-tack.onrender.com

------------------------------------------------------------------------

## Features

-   Join video chat rooms instantly
-   Enter a display name before joining
-   Multiple predefined rooms:
    -   General Discussion
    -   Tech & Development
    -   Gaming Zone
    -   Business & Networking
-   Real-time video and audio communication
-   Browser-based (no installation required)

------------------------------------------------------------------------

## How It Works

1.  Open the application in your browser.
2.  Enter your display name.
3.  Select a room from the dropdown.
4.  Click **Join Chat**.
5.  Grant camera and microphone permissions.
6.  Start communicating with other participants.

------------------------------------------------------------------------

## Technology Stack (Typical Setup)

This type of application is commonly built using:

-   **WebRTC** -- Real-time video/audio communication
-   **JavaScript (Client-side)** -- UI and media handling
-   **Node.js** -- Backend signaling server
-   **WebSockets / Socket.IO** -- Real-time signaling
-   **STUN/TURN servers** -- NAT traversal for peer connections

------------------------------------------------------------------------

## Requirements

-   Modern browser (Chrome, Edge, Firefox, Safari)
-   Camera and microphone
-   Stable internet connection
-   HTTPS environment (required for WebRTC)

------------------------------------------------------------------------

## Local Setup (Developer Guide)

### Prerequisites

-   Node.js installed
-   npm or yarn

### Installation

``` bash
npm install
```

### Start the server

``` bash
nodemon app.js
```

Then open your browser and navigate to:

    https://localhost:3000

------------------------------------------------------------------------


## Troubleshooting

**Camera or microphone not working** - Check browser permissions. -
Ensure HTTPS is enabled.

------------------------------------------------------------------------

