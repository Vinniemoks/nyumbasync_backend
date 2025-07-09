# NyumbaSync Backend Documentation
## Table of Contents

- [NyumbaSync Backend Documentation](#nyumbasync-backend-documentation)
  - [Table of Contents](#table-of-contents)
- [Project Overview](#project-overview)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Clone the Repository](#clone-the-repository)
- [Install Dependencies](#install-dependencies)
- [or](#or)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
  - [Development Mode](#development-mode)
  - [Production Mode](#production-mode)
- [API Reference](#api-reference)
- [Authentication:](#authentication)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
  - [Contribution Guidelines:](#contribution-guidelines)
- [Reporting Issues](#reporting-issues)
- [License](#license)
- [Contact](#contact)


# Project Overview
NyumbaSync Backend is the server-side component of the NyumbaSync platform. It manages data, handles business logic, and exposes APIs for frontend clients and third-party integrations. The backend is designed to be robust, scalable, and easy to contribute to for both new and experienced developers.

# Features
- RESTful API for managing core resources

- User authentication and authorization

- Database integration

- Modular codebase for easy extension

- Environment-based configuration

# Getting Started

## Prerequisites

- Git (for cloning the repository)

- Node.js (version 18.X.X or higher) and npm or yarn

- MongoDB (preffered Atlas remote instance)

- .env file with required environment variables

# Installation

## Clone the Repository

```bash
git clone https://github.com/Vinniemoks/nyumbasync_backend
cd nyumbasync_backend

# Install Dependencies

```bash
npm install```

# or
``` bash
yarn install ```

# Configuration

## Environment Variables

- Copy the environment file and update values as needed:

``` bash
cp .env ``` 

Edit .env to set your database URI, port, and other secrets.

# Database Setup

Ensure MongoDB is running and accessible with the credentials provided in your .env file.

# Running the Application

## Development Mode

``` bash
npm run dev ```

## Production Mode

``` bash
npm start ```

# API Reference

| Method | Endpoint          | Description                | Auth Required |
| ------ | ----------------- | --------------------------| ------------- |
| GET    | /api/users        | List all users             | Yes           |
| POST   | /api/users        | Create a new user          | No            |
| GET    | /api/houses       | List all houses            | Yes           |
| POST   | /api/houses       | Add a new house            | Yes           |
| PUT    | /api/houses/:id   | Update house details       | Yes           |
| DELETE | /api/houses/:id   | Delete a house             | Yes           |


# Authentication: 

JWT-based authentication is used for protected endpoints. Include the token in the Authorization header as Bearer <token>.

# Project Structure

nyumbasync_backend/
├── controllers/      # Route handlers and business logic
├── models/           # Database schemas/models
├── routes/           # API route definitions
├── middlewares/      # Custom middleware functions
├── config/           # Configuration files and helpers
├── utils/            # Utility functions
├── tests/            # Unit and integration tests
├── .env.example      # Example environment variables
├── package.json      # Project metadata and scripts
└── README.md         # Project documentation

# Contributing

We welcome contributions from the community! To contribute:
Fork the repository and create your branch:

``` bash 

git checkout -b feature/your-feature-name ```

Write clear, well-documented code and include tests if applicable.

Follow the existing code style and naming conventions please.

Commit your changes with descriptive messages.

Push to your fork and submit a Pull Request with a detailed description.

## Contribution Guidelines:

Check for an existing CONTRIBUTING.md file or instructions in the README.
Open an issue for major changes before starting work.

# Reporting Issues

Use the Issues tab to report bugs, request features, or ask questions.
Provide as much detail as possible, including steps to reproduce, expected behavior, and screenshots if relevant.

# License

This project is licensed under the MIT License. See the LICENSE file for details.

# Contact

For questions, feedback, or support, open an issue on GitHub or contact the project maintainer via the repository profile.