import React, { useState } from 'react';
import { X, Zap, Terminal, Search, Shield, Globe, Cpu, FileText, Network, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentGuideProps {
  onClose: () => void;
}

interface Category {
  icon: React.ReactNode;
  label: string;
  color: string;
  description: string;
  examples: { cmd: string; what: string }[];
}

const CATEGORIES: Category[] = [
  {
    icon: <Terminal className="w-4 h-4" />,
    label: 'System & Files',
    color: 'text-emerald-400',
    description: 'Control the file system, processes, and system info',
    examples: [
      { cmd: "what's running on this system", what: 'Shows active processes' },
      { cmd: "check disk space", what: 'df -h output' },
      { cmd: "find all python files in /root", what: 'Recursive file search' },
      { cmd: "show me what's listening on the network", what: 'Open ports & sockets' },
      { cmd: "read the file /etc/passwd", what: 'Cat a file' },
      { cmd: "create a reverse shell payload", what: 'Generates bash/python shell' },
      { cmd: "what OS and kernel version is this", what: 'uname & system info' },
      { cmd: "show all environment variables", what: 'env output' },
      { cmd: "kill process named X", what: 'pkill / kill PID' },
      { cmd: "compress this folder into a zip", what: 'zip / tar archive' },
    ],
  },
  {
    icon: <Network className="w-4 h-4" />,
    label: 'Network & Scanning',
    color: 'text-blue-400',
    description: 'Scan networks, discover hosts, probe services',
    examples: [
      { cmd: "scan 192.168.1.1 for open ports", what: 'nmap full scan' },
      { cmd: "find all live hosts on my network", what: 'Host discovery sweep' },
      { cmd: "what services are running on port 80", what: 'Service version detection' },
      { cmd: "run a stealth SYN scan on 10.0.0.0/24", what: 'nmap -sS on subnet' },
      { cmd: "check if port 443 is open on google.com", what: 'Quick port check' },
      { cmd: "sniff traffic on eth0 for 10 seconds", what: 'tcpdump capture' },
      { cmd: "traceroute to 8.8.8.8", what: 'Network path trace' },
      { cmd: "scan for vulnerabilities on 10.10.10.5", what: 'nmap NSE vuln scripts' },
      { cmd: "what is my external IP", what: 'curl ifconfig.me' },
      { cmd: "ARP scan the local subnet", what: 'arp-scan -l' },
    ],
  },
  {
    icon: <Shield className="w-4 h-4" />,
    label: 'Exploitation & Attacks',
    color: 'text-red-400',
    description: 'Run exploits, generate payloads, crack credentials',
    examples: [
      { cmd: "search metasploit for eternalblue", what: 'msfconsole search' },
      { cmd: "generate a windows reverse shell meterpreter payload", what: 'msfvenom payload' },
      { cmd: "brute force SSH on 10.0.0.1 with rockyou", what: 'hydra SSH attack' },
      { cmd: "crack this hash: 5f4dcc3b5aa765d61d8327deb882cf99", what: 'hashcat / john' },
      { cmd: "run sqlmap on http://target.com/login?id=1", what: 'SQL injection scan' },
      { cmd: "exploit ms17-010 on 192.168.1.50", what: 'EternalBlue via msf' },
      { cmd: "create a phishing page that looks like gmail", what: 'SET / manual clone' },
      { cmd: "run nikto against http://10.0.0.1", what: 'Web vuln scanner' },
      { cmd: "find and exploit LFI on this site", what: 'LFI detection & exploit' },
      { cmd: "start a listener on port 4444", what: 'nc / metasploit handler' },
    ],
  },
  {
    icon: <Eye className="w-4 h-4" />,
    label: 'OSINT & Recon',
    color: 'text-purple-400',
    description: 'Investigate people, domains, emails, usernames',
    examples: [
      { cmd: "find all emails from domain company.com", what: 'theHarvester email recon' },
      { cmd: "enumerate subdomains of target.com", what: 'amass / subfinder' },
      { cmd: "check if username johndoe exists everywhere", what: 'sherlock scan' },
      { cmd: "whois lookup on domain.com", what: 'Registrar & ownership info' },
      { cmd: "find all links and emails on this website", what: 'Web scraper / spider' },
      { cmd: "check if this email was in a data breach", what: 'HIBP API query' },
      { cmd: "run recon-ng on target.com", what: 'Full recon framework' },
      { cmd: "find GitHub repos for this username", what: 'GitHub OSINT' },
      { cmd: "search shodan for webcams in Germany", what: 'Shodan query' },
      { cmd: "get DNS records for domain.com", what: 'dig / dnsrecon' },
    ],
  },
  {
    icon: <Globe className="w-4 h-4" />,
    label: 'Web & Downloads',
    color: 'text-yellow-400',
    description: 'Fetch pages, download files, interact with APIs',
    examples: [
      { cmd: "download the latest version of X tool", what: 'wget / curl download' },
      { cmd: "fetch the headers from https://example.com", what: 'curl -I request' },
      { cmd: "clone the github repo https://github.com/x/y", what: 'git clone' },
      { cmd: "make a POST request to this API with this data", what: 'curl POST request' },
      { cmd: "install sqlmap from github", what: 'git clone + setup' },
      { cmd: "scrape all links from a website", what: 'Python scraper' },
      { cmd: "check if a site is up or down", what: 'curl with timeout' },
      { cmd: "download all images from this page", what: 'wget recursive' },
    ],
  },
  {
    icon: <Cpu className="w-4 h-4" />,
    label: 'Code & Scripting',
    color: 'text-orange-400',
    description: 'Write, run, and debug code in any language',
    examples: [
      { cmd: "write a python port scanner and run it", what: 'Python script + exec' },
      { cmd: "write a bash script that monitors a log file", what: 'Bash script creation' },
      { cmd: "run this python code: print('hello')", what: 'Direct code execution' },
      { cmd: "install the requests library and use it", what: 'pip install + run' },
      { cmd: "write and run a keylogger in python", what: 'Python pynput script' },
      { cmd: "create a simple http server on port 8080", what: 'python -m http.server' },
      { cmd: "write a script that pings 100 IPs in parallel", what: 'Async ping script' },
      { cmd: "compile and run this C code", what: 'gcc + exec' },
    ],
  },
  {
    icon: <Search className="w-4 h-4" />,
    label: 'Wireless & Bluetooth',
    color: 'text-cyan-400',
    description: 'WiFi attacks, handshake capture, WPA cracking',
    examples: [
      { cmd: "put wlan0 into monitor mode", what: 'airmon-ng start wlan0' },
      { cmd: "scan for nearby WiFi networks", what: 'airodump-ng scan' },
      { cmd: "capture the WPA handshake from SSID X", what: 'Targeted handshake cap' },
      { cmd: "crack this .cap file with rockyou wordlist", what: 'aircrack-ng / hashcat' },
      { cmd: "deauth all clients on this access point", what: 'aireplay-ng deauth' },
      { cmd: "start a fake access point named FreeWifi", what: 'airbase-ng / hostapd' },
      { cmd: "crack WPS on this router", what: 'reaver / bully attack' },
    ],
  },
  {
    icon: <FileText className="w-4 h-4" />,
    label: 'Natural Language Commands',
    color: 'text-pink-400',
    description: 'Just talk naturally — Lexi understands what you mean',
    examples: [
      { cmd: "check this place out", what: 'Runs nmap on current target' },
      { cmd: "get in", what: 'Attempts exploitation of found vulns' },
      { cmd: "what can you see", what: 'Enumeration of current system' },
      { cmd: "grab the flags", what: 'Searches for CTF flag patterns' },
      { cmd: "clean up after yourself", what: 'Removes logs and traces' },
      { cmd: "set up persistence", what: 'Installs backdoor/cron job' },
      { cmd: "dump everything", what: 'Extract passwords/hashes/data' },
      { cmd: "go deeper", what: 'Escalate privileges or pivot' },
      { cmd: "figure out what that is", what: 'Identifies unknown service/file' },
      { cmd: "make it work", what: 'Debugs and fixes the current task' },
    ],
  },
];

function CategorySection({ cat }: { cat: Category }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-card/80 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className={cat.color}>{cat.icon}</span>
        <div className="flex-1">
          <div className="font-semibold text-sm text-foreground">{cat.label}</div>
          <div className="text-[11px] text-muted-foreground">{cat.description}</div>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="divide-y divide-border/50">
          {cat.examples.map((ex, i) => (
            <div key={i} className="px-4 py-2.5 flex gap-3 bg-background/40">
              <div className="flex-1">
                <span className={cn('font-mono text-xs', cat.color)}>"{ex.cmd}"</span>
              </div>
              <div className="text-[11px] text-muted-foreground text-right shrink-0 max-w-[140px]">{ex.what}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentGuide({ onClose }: AgentGuideProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-foreground">Lexi Agent Guide</h2>
            <p className="text-xs text-muted-foreground">Everything you can tell her to do</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-xl hover:bg-card transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">

          {/* How it works */}
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-primary text-sm">
              <Zap className="w-4 h-4" /> How Agent Mode Works
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Lexi is fused with her execution engine. She reads your message, figures out what you want, and executes it directly in a real bash shell — no manual commands needed. She installs anything she's missing, chains steps together automatically, and only asks when she truly needs your input.
            </p>
          </div>

          {/* Tips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: 'Talk naturally', body: 'Say what you want, not how to do it. Lexi figures out the commands.' },
              { title: 'She auto-installs', body: 'If a tool is missing, she installs it automatically and continues.' },
              { title: 'Full shell access', body: 'Real bash shell. Nmap, metasploit, python, wget — all real, all live.' },
              { title: 'She remembers context', body: 'Commands share a shell session. Files and variables persist between messages.' },
              { title: 'One step at a time', body: 'She executes, sees output, decides next step — fully autonomous.' },
              { title: 'Just say "go deeper"', body: 'Vague follow-ups work. She knows what you mean from context.' },
            ].map((tip, i) => (
              <div key={i} className="p-3 rounded-xl bg-card border border-border">
                <div className="font-semibold text-xs text-foreground mb-1">{tip.title}</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">{tip.body}</div>
              </div>
            ))}
          </div>

          {/* Quick activate */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="font-semibold text-emerald-400 text-sm mb-2">Activating Agent Mode</div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">
              Agent Mode is shown in the sidebar. When ON, every message goes through the execution engine. Toggle it off for pure conversation.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-mono">You can also say:</span> "agent mode on" · "start executing" · "do it yourself" · "just run it"
            </p>
          </div>

          {/* Categories */}
          <div className="font-semibold text-sm text-foreground/70 uppercase tracking-wider pt-2">What You Can Ask Her To Do</div>
          <div className="space-y-2">
            {CATEGORIES.map((cat) => (
              <CategorySection key={cat.label} cat={cat} />
            ))}
          </div>

          {/* Footer note */}
          <div className="text-[11px] text-muted-foreground/60 text-center pt-2 pb-1">
            Lexi has a real bash shell with Kali Linux tools installed. All commands execute for real.
          </div>
        </div>
      </div>
    </div>
  );
}
