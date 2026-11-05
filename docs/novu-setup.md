# Novu Cloud — Notification Setup Guide

This guide covers how to set up Novu Cloud notifications for the Gauzy AI matching pipeline.

## Overview

When AI scoring produces a high-confidence match (score ≥ `NOVU_MATCH_NOTIFY_THRESHOLD`, default 80), Gauzy AI sends a notification via **Novu Cloud**. This is handled by `NovuService.sendMatchAlert()`.

## Prerequisites

1. Create a free account at [novu.co](https://novu.co)
2. Get your **API Key** from the Novu dashboard (Settings → API Keys)

## Environment Variables

```bash
# Required — Novu API key from dashboard
NOVU_API_KEY=your-novu-api-key-here

# Optional — minimum AI score to trigger notification (default: 80)
NOVU_MATCH_NOTIFY_THRESHOLD=80
```

## Workflow Setup

Create a workflow named **`new-job-match`** in the Novu dashboard:

### 1. Create the Workflow

-   Go to **Workflows** → **Create Workflow**
-   Name: `new-job-match`
-   Identifier: `new-job-match` (must match exactly)

### 2. Add Notification Steps

#### Email Step

Subject:

```
🎯 New Job Match ({{matchScore}}%) — {{jobTitle}}
```

Body template:

```html
<h2>New High-Score Job Match Found!</h2>

<p>Hi {{employeeName}},</p>

<p>A new job matching your criteria was found with a <strong>{{matchScore}}%</strong> match score.</p>

<h3>Job Details</h3>
<ul>
	<li><strong>Title:</strong> {{jobTitle}}</li>
	<li><strong>Source:</strong> {{providerCode}}</li>
	<li><strong>Match Score:</strong> {{matchScore}}%</li>
</ul>

<h3>AI Analysis</h3>
<p>{{explanation}}</p>

<p><a href="{{dashboardUrl}}">View in Dashboard →</a></p>
```

#### In-App Step (Optional)

Content:

```
🎯 {{matchScore}}% match: "{{jobTitle}}" on {{providerCode}} — {{explanation}}
```

### 3. Payload Schema

The `sendMatchAlert()` method sends the following payload:

```json
{
	"employeeName": "John Doe",
	"jobTitle": "Senior React Developer",
	"providerCode": "upwork",
	"matchScore": 85,
	"explanation": "Strong skills match with appropriate rate.",
	"dashboardUrl": "https://app.hust.so/matches"
}
```

### 4. Subscriber Setup

Novu subscribers are identified by the employee's `userId`. Ensure employees have valid email addresses in the Gauzy system for email notifications to work.

## Graceful Degradation

-   If `NOVU_API_KEY` is empty/missing, `NovuService` logs a warning and skips all notifications
-   If a notification fails to send, the error is caught and logged — it does **not** block the matching pipeline
-   Notifications are sent **after** matches are saved, so notification failures never cause data loss

## Testing

1. Set `NOVU_MATCH_NOTIFY_THRESHOLD=0` to trigger notifications for all scored matches
2. Run a crawl cycle and check the Novu dashboard for activity
3. Verify email delivery in Novu Activity Feed

## Troubleshooting

| Issue                        | Solution                                              |
| ---------------------------- | ----------------------------------------------------- |
| No notifications sent        | Check `NOVU_API_KEY` is set and valid                 |
| Workflow not found           | Ensure workflow identifier is exactly `new-job-match` |
| Email not delivered          | Check subscriber email in Novu dashboard              |
| Notifications for low scores | Increase `NOVU_MATCH_NOTIFY_THRESHOLD`                |
