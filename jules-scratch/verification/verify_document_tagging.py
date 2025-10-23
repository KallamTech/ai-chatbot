from playwright.sync_api import sync_playwright, Page, expect
import sys

def run_verification(page: Page):
    """
    This test verifies that a user can tag a document using the "@" symbol.
    """
    print("Starting verification script...", file=sys.stderr)
    # 1. Arrange: Go to the chat page.
    print("Navigating to http://localhost:3000...", file=sys.stderr)
    page.goto("http://localhost:3000")
    print("Navigation complete.", file=sys.stderr)

    # 2. Act: Type "@" in the chat input to trigger the document tagging component.
    print("Filling input with '@'...", file=sys.stderr)
    chat_input = page.get_by_test_id("multimodal-input")
    chat_input.fill("@")
    print("Fill complete.", file=sys.stderr)

    # 3. Assert: The document tagging component should be visible.
    print("Waiting for document tagging component...", file=sys.stderr)
    document_tagging = page.get_by_test_id("document-tagging")
    expect(document_tagging).to_be_visible()
    print("Document tagging component is visible.", file=sys.stderr)

    # 4. Act: Click on a document in the list.
    document_to_select = "Monet"
    print(f"Clicking on '{document_to_select}'...", file=sys.stderr)
    page.get_by_text(document_to_select).click()
    print("Click complete.", file=sys.stderr)

    # 5. Assert: The input should now contain the tagged document.
    print("Checking input value...", file=sys.stderr)
    expect(chat_input).to_have_value(f" @{document_to_select} ")
    print("Input value is correct.", file=sys.stderr)

    # 6. Screenshot: Capture the final result for visual verification.
    screenshot_path = "jules-scratch/verification/verification.png"
    print(f"Taking screenshot at {screenshot_path}...", file=sys.stderr)
    page.screenshot(path=screenshot_path)
    print("Screenshot taken.", file=sys.stderr)
    print("Verification script finished successfully.", file=sys.stderr)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        run_verification(page)
    finally:
        browser.close()
