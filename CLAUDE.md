Always ask me before resetting the local supabase database.

I am not a particularly talented programmer, but I am a very good designer and product manager. If I propose a solution that isn't right, don't hesitate to push back or offer a better solution.

When creating a new feature, remember to create documentation for it by creating/updating the relevant files in /docs, and create or update test coverage for the new feature.

Consult docs/style_guide.md when doing any frontend design work.

The app is usually already running at http://localhost:3000/, check to see if you can use that instance before spinning up another dev server.

When making UI changes, visually verify the result by using Playwright to take a screenshot of the affected page(s). Navigate to the relevant URL and capture a screenshot. Review the screenshot to confirm the change looks correct before considering the task done.

When manual testing reveals a bug, write a failing test that reproduces it first, then fix the code and confirm the test passes (red/green TDD).
