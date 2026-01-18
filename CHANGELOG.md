# Changelog

All notable changes to the Light Cloud extension will be documented in this file.

## [0.1.3] - 2026-01-18

### Fixed
- Fixed organisation selection - now prompts user when multiple organisations exist
- Uses `lightcloud.defaultOrganisation` setting if configured

## [0.1.2] - 2026-01-18

### Changed
- Fixed repository URL to point to correct GitHub repo

## [0.1.1] - 2026-01-18

### Changed
- Improved README with badges, cleaner structure, and better marketplace presentation

## [0.1.0] - 2026-01-18

### Added
- Initial release
- `/deploy` - Deploy projects from GitHub or upload source directly
- `/redeploy` - Redeploy current environment
- `/status` - View application health and status
- `/list` - List all applications and environments
- `/plan` - Preview deployment configuration
- `/destroy` - Delete applications or environments
- `/login` and `/logout` - Authentication management
- Automatic framework detection (React, Next.js, Vue, Angular, Python, Node.js, etc.)
- GitHub integration for automatic deployments
- Upload deployment for projects without GitHub
- Dashboard and deployment URLs shown directly in chat
- Project configuration saved to `.lightcloud` file
