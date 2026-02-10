/* resume-data.js
   This file is OPTIONAL.
   - If you use a combined `resume.json`, you can delete this file entirely.
   - If you do NOT have a combined JSON, this provides the non-bullet content
     (profile, highlights, jobs with start/end dates, education, skills).
*/

window.RESUME_PROFILE = window.RESUME_PROFILE || {
  name: "Justin Cole",
  contactLine: "Saco, Maine • (207) 205-4767 • jcole85@gmail.com • LinkedIn: linkedin.com/in/justin-cole-42aa26142"
};

window.RESUME_SECTIONS = window.RESUME_SECTIONS || {
  summary:
    "As an experienced technology professional with a wide breadth of experience, I have an eye for identifying problems, and the skillset to resolve them. I enjoy seeking out challenges and engineering better processes and higher overall operating efficiency.",
  highlights: [
    "Extensive technical project management background combined with business analysis and data analytics to align initiatives with organizational goals.",
    "Strong leadership experience with a proven record of mentoring teams, fostering cross-functional collaboration, and driving continuous improvement.",
    "Skilled in designing and implementing scalable IT infrastructure, cloud solutions, and automation scripts to enhance operational efficiency and reduce manual errors."
  ],
  education: [
    { school: "University of Maine, Augusta", details: "B.A. Liberal Studies - 2014" },
    { school: "Worcester Polytechnic Institute", details: "B.S. Computer Science - 2009" }
  ],
  skills:
    "Microsoft SQL, Windows Administration, Azure, Cisco, IAM, Patch Management, Active Directory, ServiceNow, Agile, Documentation, Customer Experience, IT Operations, Automation"
};

/* Jobs list WITH start/end dates.
   IMPORTANT: this is what keeps your new start/end date format working.
   The `employer` value here must match Employer strings in job-points.json.
*/
window.RESUME_JOBS = window.RESUME_JOBS || [
  { employer: "Anaqua", title: "Cloud Engineer", startDate: "07/2022", endDate: "09/2024" },
  { employer: "Run As Cloud / Keyrus US", title: "Cloud Engineer", startDate: "02/2022", endDate: "07/2022" },
  { employer: "WEX", title: "Systems Administrator", startDate: "02/2019", endDate: "01/2022" },
  { employer: "Smartware", title: "IT Manager", startDate: "01/2015", endDate: "02/2019" },
  { employer: "IDEXX Laboratories", title: "Customer Support Specialist", startDate: "01/2013", endDate: "01/2015" },
  { employer: "Winslow Schools", title: "Technology Coordinator", startDate: "01/2011", endDate: "01/2013" },
  { employer: "School Union 7", title: "Technology Coordinator", startDate: "01/2010", endDate: "01/2011" },
  { employer: "MSAD 63", title: "Technology Coordinator", startDate: "01/2008", endDate: "01/2010" }
];

/* If you have the job-points JSON inline instead of a separate file,
   you can set window.JOB_POINTS = {...} here, and resume.js will pick it up.
*/
