from playwright.sync_api import sync_playwright
import time

def check():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on('console', lambda msg: print(f'BROWSER_LOG: {msg.text}', flush=True))
        page.on('pageerror', lambda exc: print(f'BROWSER_ERR: {exc}', flush=True))
        page.goto('http://localhost:8080/index.html')
        time.sleep(1)
        
        print("Clicking Load Game...", flush=True)
        page.click("#btn-mm-load", timeout=3000)
        time.sleep(1)
        
        print("Clicking Load on first slot...", flush=True)
        page.click(".save-slot .btn-load", timeout=3000)
        time.sleep(2)
        
        print("Done.", flush=True)

if __name__ == '__main__':
    check()
