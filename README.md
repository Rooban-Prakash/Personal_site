# 🕸️ Rooban Prakash — Cybersecurity Portfolio

> An interactive personal portfolio built around cybersecurity, SOC operations, security engineering, and technical projects.

🌐 **Live Website:** https://brown-termite-124041.hostingersite.com/#/
💻 **GitHub:** https://github.com/Rooban-Prakash/Personal_site

---

## About

This repository contains my personal cybersecurity portfolio.

Instead of using a conventional portfolio layout, the website uses an interactive **spider-web visualization** as its primary navigation interface. Each node represents a different area of my technical background, projects, skills, and interests.

The goal is to make the portfolio feel less like a static resume and more like an interactive representation of my cybersecurity journey.

---

## 🕸️ Interactive Spider Web

The homepage features an interactive SVG-based network.

The graph represents the relationships between different areas of my work:

```text
                         ┌── SIEM
                         │
                  ┌──── SOC
                  │      │
                  │      └── Detection
                  │
            ┌─────┤
            │     │
            │     └── Security Projects
            │
        ROOBAN
            │
            ├── Skills
            │
            ├── Labs
            │
            ├── Writeups
            │
            └── Contact
```

The graph includes:

* Interactive nodes
* Node dragging
* Dynamic link positioning
* Node highlighting
* Connected-node visualization
* Physics-based movement
* Responsive SVG rendering

---

## 🔐 Focus Areas

My primary areas of interest include:

* Security Operations
* SOC Analysis
* SIEM
* Threat Detection
* Incident Response
* Network Security
* Infrastructure Monitoring
* Linux
* Windows Security
* Security Automation
* Detection Engineering

---

## 🛠️ Technologies

### Security

* Wazuh
* Splunk
* Zabbix
* SIEM
* IDS/IPS
* Log Analysis
* MITRE ATT&CK
* Incident Detection
* Security Monitoring

### Infrastructure

* Linux
* Windows
* Proxmox
* pfSense
* Networking
* Virtualization

### Development

* HTML
* CSS
* JavaScript
* PHP
* SVG
* REST APIs
* Supabase
* Git / GitHub

---

## 📂 Project Structure

```text
.
├── index.html
├── assets/
│   └── theme.css
│
├── admin/
│   ├── index.html
│   └── script.js
│
├── dashboard/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── save.php
├── laptop.jpg
└── README.md
```

---

## ⚙️ Architecture

The main portfolio is intentionally built without a frontend framework.

The current implementation uses:

```text
HTML
  │
  ├── CSS
  │
  └── Vanilla JavaScript
          │
          ├── Router
          ├── SVG Graph
          ├── Physics Simulation
          ├── Interactive Nodes
          └── Dynamic Content
```

The site uses client-side JavaScript for the interactive experience while PHP is used where server-side functionality is required.

---

## 🕸️ Graph Physics

The spider-web visualization uses a lightweight physics simulation.

Nodes interact through:

* Repulsion forces
* Spring forces between connected nodes
* Center attraction
* Velocity damping
* Position constraints

This allows the graph to behave more like a dynamic network rather than a static diagram.

Nodes can also be manually dragged by the user.

---

## 🔑 Admin Interface

The project contains a separate `/admin` interface for managing website content.

The admin functionality is separated from the public portfolio and can be protected using server-level authentication on the hosting environment.

The server-side save functionality is handled through:

```text
save.php
```

---

## 📊 Dashboard

The repository also contains a separate dashboard application.

```text
/dashboard
```

The dashboard is designed to provide an interactive interface for tracking personal workout data and demonstrates integration with a backend service.

---

## 🚀 Running Locally

Because the project contains PHP functionality, use a PHP-enabled local server rather than Python's basic HTTP server.

```bash
php -S localhost:8080
```

Then open:

```text
http://localhost:8080
```

For purely static portions of the site, a normal static HTTP server can also be used.

---

## 🌐 Deployment

The website can be deployed to a standard web host supporting:

* HTML
* CSS
* JavaScript
* PHP

The project is designed to work without a Node.js runtime or frontend build process.

---

## 🔒 Security Considerations

The public frontend does not contain server-side secrets.

For backend integrations:

* Public client-side keys should only be used where the service explicitly supports them.
* Secret/service-role credentials must never be exposed in frontend JavaScript.
* Administrative functionality should be protected at the server or hosting layer.
* HTTPS should be enabled in production.
* Database access should be protected using appropriate authentication and Row Level Security policies where applicable.

---

## 🎯 Goals

The project is continuously evolving.

Future improvements may include:

* Interactive security labs
* SOC investigation simulations
* Security writeups
* MITRE ATT&CK visualization
* Security-focused utilities
* More advanced graph interactions
* Real-time infrastructure monitoring
* Additional cybersecurity projects

---

## 📌 Why This Project?

Most personal portfolios present information as a collection of static pages.

I wanted to experiment with a different approach.

The website itself acts as a visualization of how different areas of cybersecurity, infrastructure, development, and personal projects connect together.

The result is a portfolio that is also a small demonstration of my approach to building interactive technical interfaces.

---

## 📜 License

This project is a personal portfolio and is primarily intended for demonstration and educational purposes.

Unless otherwise stated, the content, personal information, and original assets belong to the author.
