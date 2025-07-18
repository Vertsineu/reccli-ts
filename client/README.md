# Rec Transfer Client - Frontend

A modern web interface for managing file transfers between Rec Cloud and PanDav WebDAV storage.

## Features

- **Dual File System Explorer**: Browse both Rec Cloud and PanDav WebDAV directories side by side
- **Interactive Transfer Management**: Select files from Rec and transfer them to PanDav with drag-and-drop simplicity
- **Real-time Transfer Monitoring**: Watch transfer progress with live updates on speed, progress, and estimated time
- **Transfer Controls**: Start, pause, resume, cancel, and restart transfers as needed
- **Modern UI**: Clean, responsive design built with React, TypeScript, and Tailwind CSS

## Technology Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Animations**: Framer Motion

## Getting Started

### Prerequisites

Make sure you have Node.js 18+ installed and the Rec Transfer Server running on port 3000.

### Installation

1. Install frontend dependencies:
```bash
npm run client:install
```

2. Start the development server:
```bash
npm run client
```

The frontend will be available at http://localhost:3001

### Building for Production

```bash
npm run client:build
```

## Usage

### 1. Login
- Enter your Rec account credentials (student ID and password)
- Enter your WebDAV credentials
- Click "Sign In" to authenticate

### 2. Browse Files
- **Left Panel**: Rec Cloud Storage - Browse your cloud files and select what to transfer
- **Right Panel**: PanDav WebDAV Storage - Navigate to your destination folder

### 3. Transfer Files
- Select files/folders in the Rec Cloud panel (they'll be highlighted)
- Navigate to the destination folder in the PanDav panel
- Click "Start Transfer" to begin the transfer process

### 4. Monitor Transfers
- Watch real-time progress in the Transfer Monitor section
- See transfer speed, progress percentage, and estimated time remaining
- Use controls to pause, resume, cancel, or restart transfers

## API Integration

The frontend communicates with the Rec Transfer Server through REST APIs:

### Authentication
- `POST /api/login` - User authentication
- `POST /api/logout` - User logout

### File System Operations
- `GET /api/rec/list` - List Rec Cloud files
- `GET /api/pandav/list` - List PanDav WebDAV files
- Various CRUD operations for both file systems

### Transfer Management
- `POST /api/transfer/create` - Create transfer task
- `POST /api/transfer/:id/start` - Start transfer
- `POST /api/transfer/:id/pause` - Pause transfer
- `POST /api/transfer/:id/resume` - Resume transfer
- `POST /api/transfer/:id/cancel` - Cancel transfer
- `GET /api/transfer/:id/status` - Get transfer status
- `GET /api/transfers` - Get all transfers

## Development

### Project Structure

```
client/
├── src/
│   ├── components/          # React components
│   │   ├── Dashboard.tsx    # Main dashboard layout
│   │   ├── FileExplorer.tsx # File browser component
│   │   ├── LoginForm.tsx    # Authentication form
│   │   └── TransferMonitor.tsx # Transfer progress monitor
│   ├── contexts/           # React contexts
│   │   └── AuthContext.tsx # Authentication state management
│   ├── services/           # API clients
│   │   └── api.ts          # HTTP client for backend APIs
│   ├── types/              # TypeScript type definitions
│   │   └── api.ts          # API response types
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global styles and Tailwind imports
├── public/                 # Static assets
├── index.html              # HTML template
├── package.json            # Dependencies and scripts
├── tailwind.config.js      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite build configuration
```

### Key Components

#### Dashboard
The main application interface that orchestrates all other components:
- Layout management
- Transfer initiation logic
- Real-time transfer status updates

#### FileExplorer
Reusable file browser component for both Rec and PanDav:
- Directory navigation with breadcrumbs
- File selection with visual feedback
- File type icons and metadata display

#### TransferMonitor
Real-time transfer progress tracking:
- Live progress bars and statistics
- Transfer control buttons (pause/resume/cancel)
- Auto-refresh every 2 seconds

#### LoginForm
Secure authentication interface:
- Dual credential input (Rec + WebDAV)
- Password visibility toggle
- Error handling and feedback

### State Management

The application uses React Context for global state:
- **AuthContext**: User authentication and session management
- Component-level state for UI interactions and data management

### Styling

Tailwind CSS provides utility-first styling with custom components:
- Consistent design tokens for colors, spacing, and typography
- Responsive design for mobile and desktop
- Custom animations and transitions

## Troubleshooting

### Common Issues

1. **Connection Error**: Ensure the Rec Transfer Server is running on port 3000
2. **Authentication Failed**: Verify your Rec and WebDAV credentials
3. **Transfer Stuck**: Check network connection and server logs

### Debug Mode

Set `NODE_ENV=development` to enable additional console logging.

## Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for new APIs or data structures
3. Include error handling for all async operations
4. Test the UI with various file sizes and network conditions

## License

This project is part of the Rec Transfer CLI tool and follows the same MIT license.
