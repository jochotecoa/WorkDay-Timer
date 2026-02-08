# WorkDay Zen

WorkDay Zen is a minimalist, productivity-focused timer designed to help you track your workday with ease. It features native system integration, smart activity detection, and a clean, "zen" interface.

## Key Features

- **Activity Detection**: The timer stays in "Listening" mode and only starts when you begin your work (first mouse move or key press).
- **Task Focus**: Set a primary objective for your session with the "What are you focusing on?" field.
- **Native Integration**: 
  - **Taskbar Badge**: Displays remaining hours directly on the app icon.
  - **Dynamic Title**: Watch the countdown in your window title or browser tab.
  - **Desktop Notifications**: Get alerts when your session starts and finishes.
- **Frameless UI**: A custom, modern interface with native-feel window controls (Minimize & Close to Tray).
- **Smart Reset**: Automatically resets at midnight so you're ready for a fresh start every morning.
- **Wake Lock**: Prevents your screen from sleeping while the focus session is active.
- **Productivity Tips**: Powered by Gemini AI to provide contextual advice for your workday.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jochotecoa/WorkDay-Timer.git
   cd WorkDay-Timer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running in Development

To start the app in development mode (with hot-reloading for both Vite and Electron):

```bash
npm run dev
```

### Building the Application

To create a production build and package the app for Windows:

```bash
npm run electron:build
```

The packaged application will be available in the `release/win-unpacked` directory.

## Usage Tips

- **Minimize vs Close**: The "Minimize" button hides the window to your taskbar. The "Close" button hides it to the **System Tray**, allowing the timer to continue running in the background.
- **Auto-Start**: Toggle the Auto-Start feature to have the app immediately begin "Listening" for activity upon launch.
- **Midnight Reset**: If the app is left open, it will automatically refresh its state at midnight to prepare for the next day.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Desktop Wrapper**: Electron
- **Build Tool**: Vite
- **AI Integration**: Google Gemini API