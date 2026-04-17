from playwright.sync_api import sync_playwright
import time

def check():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:8080/index.html')
        time.sleep(1)
        page.click("#btn-mm-new", timeout=3000)
        time.sleep(1)
        page.click("#btn-cc-start", timeout=3000)
        time.sleep(2)
        
        page.screenshot(path='/tmp/inspect.png', full_page=True)
        print("Saved screenshot to /tmp/inspect.png")
        browser.close()

if __name__ == '__main__':
    check()
