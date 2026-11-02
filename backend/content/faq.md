# 101 Codecrafts — Frequently Asked Questions

<!--
This file is the single source of truth for the FAQ accordion (/assistant/faq),
the floating widget's FAQ tab, and the 101 Assistant's grounded answers (RAG).

Format rules (parsed by lib/ai/faq.ts — keep them or the parser test fails):
  - "## <Category>" starts a category.
  - "### <Question>" starts a question; everything until the next ### or ## is the answer.
  - An optional line "Tags: a, b, c" at the end of an answer adds search tags.
  - Anything the founders must confirm before launch is marked TODO-CONFIRM.
    The assistant is instructed to tell users those details are "still being confirmed".
-->

## About 101 Codecrafts

### What is 101 Codecrafts?
101 Codecrafts is a tech learning and collaboration community based in Kampala, Uganda. Our tagline is "Start at 101. Craft your way up." We help people grow in IT — as programmers, computer scientists, data analysts, ethical hackers, software engineers and other tech professionals — through hands-on learning, real-world projects, mentorship and career support. We welcome every skill level, from complete beginners to working professionals.
Tags: about, mission, community, kampala, uganda

### Who started 101 Codecrafts?
101 Codecrafts was founded by Businge Daglous (founder), with co-founders Ngabirano Octavious and Mwesigwa Allan.
Tags: founders, team, leadership

### Who is 101 Codecrafts for?
Anyone who wants to build a career or skills in tech: secondary-school leavers, university students, career switchers, self-taught developers and professionals who want to level up. You do not need prior coding experience to join — every learning path starts at "101", the absolute basics.
Tags: beginners, students, career switch, eligibility

### Do I have to live in Kampala to take part?
No. Most learning, study groups and many workshops happen online, so members anywhere can take part. Some events — meetups, hackathons and demo days — are held in person in Kampala, and we announce the venue for each one.
TODO-CONFIRM: which events are in-person only.
Tags: online, remote, location, in-person

## Joining & Membership

### How do I join 101 Codecrafts?
1. Click "Join Community" on the website and create your account (email or Google sign-in).
2. Complete your profile and choose a learning path.
3. Join the community WhatsApp group: https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh
4. Introduce yourself and join your path's study group.
Tags: join, sign up, register, account, whatsapp

### How much does it cost to join?
Creating an account and joining the community is free. Some premium items — for example certificate assessments, intensive bootcamps or paid mentorship — may carry a fee in Ugandan shillings (UGX).
TODO-CONFIRM: final list of free vs paid items and their UGX prices.
Tags: cost, price, free, fees, ugx, membership

### What is the difference between a learner and a tutor account?
Learners follow learning paths, join study groups, submit projects and attend events. Tutors are experienced members approved by the team to teach workshops, review projects and mentor learners. You sign up as a learner; you can apply to become a tutor from your dashboard once you have shown expertise in a path.
TODO-CONFIRM: tutor application requirements.
Tags: tutor, learner, roles, mentor, teach

### Can I become a tutor or mentor?
Yes. If you have solid experience in one of our paths, apply from your dashboard ("Become a tutor"). The team reviews applications and may ask for a short demo session. Approved tutors get a tutor badge and can host workshops and review projects.
TODO-CONFIRM: whether tutors are paid or volunteer, and the review timeline.
Tags: tutor, mentor, volunteer, teach, apply

### How do I delete my account?
Go to your dashboard settings and choose "Delete account", or email the team. Deleting your account removes your profile, assistant chat history and personal whiteboards. Records we must keep by law (for example payment receipts) are retained only as long as required.
TODO-CONFIRM: support email address.
Tags: delete account, close account, data removal

## Learning Paths

### What learning paths do you offer?
We currently offer six learning paths:
- Software Engineering
- Data Science & Analytics
- Cybersecurity & Ethical Hacking
- AI & Machine Learning
- Cloud & DevOps
- IT Infrastructure & Networking
Each path starts from the basics and progresses through hands-on projects.
Tags: paths, tracks, courses, curriculum

### Which learning path should I choose?
Pick the one that matches what you enjoy:
- You like building apps and websites → Software Engineering.
- You like numbers, spreadsheets and finding patterns → Data Science & Analytics.
- You like puzzles, security and how systems break → Cybersecurity & Ethical Hacking.
- You are curious about how ChatGPT-style systems work → AI & Machine Learning (best after some Python).
- You like automating servers and deployments → Cloud & DevOps.
- You like hardware, networks and keeping systems running → IT Infrastructure & Networking.
Not sure? Ask the 101 Assistant to recommend a path — it asks about your interests, experience and time.
Tags: choose path, recommendation, which track

### Do I need a laptop?
A laptop or desktop computer is strongly recommended for every path. Many beginner lessons can be started on a phone using browser-based tools, and you can use computer labs at partner campuses for in-person sessions.
TODO-CONFIRM: available lab access.
Tags: laptop, computer, equipment, phone

### How long does a learning path take?
It depends on your pace. As a guide, the beginner stage of a path takes about 8–12 weeks at 5–8 hours per week, and reaching job-ready level usually takes 6–12 months of consistent practice and projects.
TODO-CONFIRM: official path durations.
Tags: duration, how long, time, weeks, pace

### Is the learning self-paced or live?
Both. Core lessons and resources are self-paced. On top of that we run live webinars, Q&A sessions, workshops, bootcamps and peer study groups, so you are never learning alone.
Tags: self-paced, live, webinars, schedule

## Events & Projects

### What events do you run?
Webinars and Q&A sessions with industry professionals, skill-building workshops and bootcamps, coding challenges, hackathons, peer study group sessions and meetups. Upcoming events are listed on the Events page and in the members' dashboard, and you can ask the 101 Assistant "what events are coming up?".
Tags: events, workshops, hackathons, webinars, meetups

### How do I register for an event?
Open the event on the Events page or your dashboard and click "Register". Free events confirm instantly; paid events take you to a Flutterwave checkout in UGX. You will get a confirmation by email and the event appears in your dashboard.
Tags: register, rsvp, event tickets

### What kind of projects will I work on?
Real-world projects: coding challenges, hackathon builds, open-source contributions and team projects that solve real problems. Completed projects are added to your profile so you can show them to employers.
Tags: projects, portfolio, open source, hackathon

### Can I join a team project if I am a beginner?
Yes. Team projects mix experience levels, and beginners get starter tasks with a mentor or experienced teammate to pair with. It is one of the fastest ways to learn.
Tags: beginner, team, collaboration

## Certifications & Careers

### Do you issue certificates?
101 Codecrafts plans to issue certificates of completion for learning paths and verified project milestones.
TODO-CONFIRM: certificate availability, requirements and any assessment fee.
Tags: certificate, completion, credential

### Do you help with professional certifications like AWS, CompTIA, CEH or CCNA?
Yes. We provide certification support — study resources, study groups and guidance — for certifications such as CompTIA, AWS, CEH, Cisco CCNA and PMP. Note that the exams themselves are run and priced by their vendors (AWS, CompTIA, EC-Council, Cisco, PMI); 101 Codecrafts does not sell vendor exam vouchers unless announced.
TODO-CONFIRM: any voucher partnerships.
Tags: aws, comptia, ceh, ccna, pmp, certification prep

### Do you help members find jobs or internships?
We offer career development support: mentorship, CV/resume reviews, mock interviews and sharing of job and internship opportunities. We do not guarantee employment.
Tags: jobs, careers, internship, resume, cv, interview

## Payments

### How do I pay for paid programmes or events?
Payments are processed by Flutterwave in Ugandan shillings (UGX). You can pay with mobile money (MTN Mobile Money, Airtel Money) or a debit/credit card at checkout. 101 Codecrafts never asks for your PIN and never stores your card details.
TODO-CONFIRM: enabled payment methods on the live Flutterwave account.
Tags: payment, flutterwave, mobile money, mtn, airtel, card, ugx

### Can I get a refund?
Our refund policy is still being finalised. Until it is published, contact the team about any payment issue and keep your Flutterwave transaction reference.
TODO-CONFIRM: refund policy (for example, a full refund if you cancel a paid event registration at least 48 hours before it starts).
Tags: refund, cancel, money back

### I paid but my registration did not update. What should I do?
Mobile money confirmations can take a few minutes. If your dashboard still does not show the payment after 30 minutes, keep your Flutterwave transaction reference and contact the team; do not pay a second time.
Tags: payment failed, pending, transaction reference

## Platform, AI & Privacy

### What is the 101 Assistant?
The 101 Assistant is the AI helper on our website. It answers questions about 101 Codecrafts from this FAQ and our site content, searches courses, lists upcoming events, recommends a learning path, explains code and shows you how to join. It cites its sources and may make mistakes, so double-check important details (such as prices and dates) with the team.
Tags: assistant, ai, chatbot, help

### What is the whiteboard and how do I use it?
The whiteboard (/whiteboard) is a shared drawing space for sketching ideas, system designs and diagrams with your team in real time. You can see teammates' cursors, save boards, export them as PNG or SVG, and click "Ask AI about this board" to have the assistant explain your sketch or turn it into a step-by-step plan. There is also a code canvas playground for creative coding.
Tags: whiteboard, canvas, drawing, diagram, collaboration

### How do you use my data?
We store only what we need to run the community: your account and profile, learning progress, event registrations, payment receipts, your assistant conversations and your saved whiteboards. Your data is protected with row-level security so other members cannot read your private records. We do not sell your data. Assistant messages are sent to our AI provider to generate answers, so do not paste passwords or other secrets into the chat.
TODO-CONFIRM: link to the full privacy policy.
Tags: privacy, data, security, gdpr, personal information

### Is my assistant chat history private?
Yes. Your conversation history is stored against your account and protected so only you can read it. You can delete your conversations at any time from the assistant page. Visitors who are not signed in can chat, but their conversations are not saved.
Tags: privacy, chat history, conversations
