import puppeteer, { ElementHandle, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Configuration for screen recording
const RecordingConfig = {
    followNewTab: true,
    fps: 25,
    ffmpeg_Path: null,
    videoFrame: {
        width: 1920,
        height: 1080,
    },
    videoCrf: 18,
    videoCodec: "libx264",
    videoPreset: "ultrafast",
    videoBitrate: 1000,
    autopad: {
        color: "black",
    },
    aspectRatio: "16:9",
};

class GoogleMeetRecorder {
    private meetUrl: string;
    private recordingDuration: number;
    private videoOutputPath: string;

    constructor(
        meetUrl: string,
        recordingDuration: number = 30000,
        videoDir: string = path.join(process.cwd(), 'report', 'video')
    ) {
        this.meetUrl = meetUrl;
        this.recordingDuration = recordingDuration;

        // Ensure video directory exists
        fs.mkdirSync(videoDir, { recursive: true });
        this.videoOutputPath = path.join(videoDir, `meet_recording_${Date.now()}.mp4`);
    }

    private async findElementByXPath(page: Page, xpath: string): Promise<ElementHandle<Element> | null> {
        const elements = await page.$x(xpath);
        return elements.length > 0 ? elements[0] as ElementHandle<Element> : null;
    }

    private async typeInElement(element: ElementHandle<Element>, text: string): Promise<void> {
        if (element) {
            await element.click({ clickCount: 3 }); // Select all existing text
            await element.type(text);
        } else {
            throw new Error('Element not found for typing');
        }
    }

    private async clickElement(element: ElementHandle<Element>): Promise<void> {
        if (element) {
            await element.click();
        } else {
            throw new Error('Element not found for clicking');
        }
    }

    async startRecording() {
        // Launch browser with permissions bypassed
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--use-fake-ui-for-media-stream',
                '--disable-blink-features=AutomationControlled',
                '--start-fullscreen',
                '--disable-features=EnableEphemeralFlashPermission',
                '--disable-web-security',
                '--allow-file-access-from-files',
                '--allow-running-insecure-content',
                '--unsafely-treat-insecure-origin-as-secure'
            ]
        });

        const page = await browser.newPage();

        // Bypass media permissions
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'mediaDevices', {
                value: {
                    getUserMedia: () => Promise.resolve({
                        getVideoTracks: () => [{ stop: () => { } }],
                        getAudioTracks: () => [{ stop: () => { } }]
                    })
                }
            });
        });

        // Set up media access permissions
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });

        try {
            // Set up screen recording
            const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
            const recorder = new PuppeteerScreenRecorder(page, RecordingConfig);

            // Navigate to Google Meet
            await page.goto(this.meetUrl, {
                waitUntil: 'networkidle0',
                // Add necessary additional options to bypass security
                timeout: 60000
            });

            // Override media device permissions
            await page.evaluate(() => {
                // @ts-ignore
                const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
                // @ts-ignore
                navigator.mediaDevices.getUserMedia = async (constraints) => {
                    return await originalGetUserMedia({
                        audio: true,
                        video: true
                    });
                };
            });

            // Set viewport to full HD
            await page.setViewport({ width: 1920, height: 1080 });

            const continueButton = await this.findElementByXPath(page, '//span[contains(text(), "Continue without microphone and camera")]');
            if (continueButton) {
                await this.clickElement(continueButton);
            }

            // Wait for name input and fill it
            const nameInput = await this.findElementByXPath(page, '//input[@placeholder="Your name"]');
            if (nameInput) {
                await this.typeInElement(nameInput, 'Meeting Bot');
            }

            // Wait for and click "Ask to join" button
            const joinButton = await this.findElementByXPath(page, '//span[contains(text(), "Ask to join")]');
            if (joinButton) {
                await this.clickElement(joinButton);
            }

            // Start recording
            await recorder.start(this.videoOutputPath);
            console.log(`🎥 Recording started - saving to ${this.videoOutputPath}`);

            // Wait for specified duration
            await page.waitForTimeout(this.recordingDuration);

            console.log("⏹️ Stopping recording...");
            await recorder.stop();
            console.log("✅ Recording saved successfully!");

        } catch (error) {
            console.error("Error occurred during meet recording:", error);
        } finally {
            // Ensure browser is closed
            await browser.close();
        }
    }
}

// Example usage
async function main() {
    const meetRecorder = new GoogleMeetRecorder(
        "https://meet.google.com/emr-eqin-uak",
        30000  // 30 seconds recording duration
    );

    try {
        await meetRecorder.startRecording();
    } catch (error) {
        console.error("Meet recording failed:", error);
    }
}

// Only run main if this file is being run directly
if (require.main === module) {
    main().catch(console.error);
}

export { GoogleMeetRecorder };
