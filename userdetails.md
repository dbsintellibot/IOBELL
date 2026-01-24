# User Credentials & Roles

This document lists the current users in the system, their roles, and their *known* test passwords.
> **Note**: Passwords listed here are for development/testing purposes. In a production environment, passwords should never be stored in plain text.

## Super Admin
Users with full system access (Users, Schools, Inventory).

| Email | Password | Role | Notes |
|-------|----------|------|-------|
| `muddasirh@gmail.com` | `password123` | **Super Admin** | Main System Administrator |

## School Admins
Users who manage a specific school (Bells, Profiles, Audio, Schedules).

| Email | Password | Role | School |
|-------|----------|------|--------|
| `principal@myschool.com` | `securepass123` | **Admin** | Springfield High |
| `admin@lincoln.edu` | `password123` | **Admin** | Lincoln High School |
| `factory_test_...@test.com` | `password123` | **Admin** | *Various Test Factories* |

## Operators
Users with limited access within a school (View only or limited control).

| Email | Password | Role | School |
|-------|----------|------|--------|
| `operator@lincoln.edu` | `password123` | **Operator** | Lincoln High School |

## Test Accounts (Generated)
These accounts were generated during automated testing.

| Email | Password | School |
|-------|----------|--------|
| `factory_test_1769091569476@test.com` | `password123` | Factory 1769091569476 |
| `factory_test_1769091141012@test.com` | `password123` | Factory 1769091141012 |
| ... and other `factory_test_` users | `password123` | |
