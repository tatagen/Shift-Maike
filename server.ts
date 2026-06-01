import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const isProd = process.env.NODE_ENV === "production";

async function startServer() {
  const app = express();
  app.use(express.json());

  // AI Shift Generation API
  app.post("/api/generate-shift", async (req, res) => {
    try {
      const {
        yearMonth,
        staff,
        patterns,
        requirements,
        submissions,
        pairRestrictions,
        rules,
        customInstructions,
        existingAssignments
      } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set");
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Extract details from rules if provided
      const maxConsecutiveDays = rules?.maxConsecutiveDays ?? 5;
      const preventDayAfterNight = rules?.preventDayAfterNight ?? true;
      const balanceWeekendShifts = rules?.balanceWeekendShifts ?? false;
      const preferConsecutiveOff = rules?.preferConsecutiveOff ?? false;
      const requireLeaderInShift = rules?.requireLeaderInShift ?? false;

      const prompt = `
        You are a mechanical shift optimization model for a hotel.
        Generate a shift schedule for ${yearMonth} based on the following strict rules and data.
        the generated assignments object should conform to the Schedule entity schema: { assignments: { date: string, userId: string, patternId: string, isLocked?: boolean, departmentId?: string }[] }.

        ### SYSTEM RULES:
        1. [ABSOLUTE] Meet daily requirements (counts for each pattern, optionally partitioned by 'departmentId' on each day).
        2. [ABSOLUTE] Never assign a staff member on their 'offDates'.
        3. [ABSOLUTE] No overlapping shifts for the same staff member on the same day.
        4. [DEPARTMENTS] If a requirement has a 'departmentId', only assign a staff member whose 'departmentIds' includes that 'departmentId'. Be sure to populate 'departmentId' on the generated assignment. Never assign a person to multiple departments at the exact same time. If a staff member has a 'primaryDepartmentId' listed and is eligible to work in multiple departments, prioritize assigning them to a shift in their 'primaryDepartmentId' over other departments.
        5. [LABOR] Respect 'maxHoursPerMonth' for each staff member.
        6. [LABOR] No 'FORBIDDEN' pairs (NG pairs) in the same shift on the same day.
        7. [INTERVAL] ${preventDayAfterNight ? "Strictly prohibit day shift immediately after a night shift for the same person (ensure 11h+ rest)." : "Allow day shift immediately after a night shift."}
        8. [STYLE] 'NIGHT_MAIN' staff get night shifts first.
        9. [STYLE] 'DAY_MAIN' staff NEVER get night shifts.
        10. [EQUALITY] 'DEFAULT' staff should have roughly equal number of night shifts.
        11. [FAIRNESS] Max ${maxConsecutiveDays} consecutive working days before a rest day is required.
        12. [WEEKENDS] ${balanceWeekendShifts ? "Prioritize assigning Saturday, Sunday, and Holiday shifts evenly among all default staff so no single person is unfairly assigned to work too many weekends." : "Saturdays / Sundays / Holidays can be assigned normally."}
        13. [REST CONTIGUITY] ${preferConsecutiveOff ? "Prefer contiguous off-days (2 or more consecutive off-days) for employees rather than isolated single-day off sequences where possible." : "No specific contiguous off preference is designated."}
        14. [LEADER PRESENCE] ${requireLeaderInShift ? "Make sure that for each active shift pattern on each day, there is at least one leader (a staff member with isLeader equal to true) assigned if possible." : "Leader presence is not required."}
        15. [REQUESTS] In Submissions, each staff may submit 'specificRequests' (an array of {date: string, patternIds: string[]}). Strongly prioritize assigning one of the requested patternIds to that user on that specific date. Let this take precedence over general styling/equality.
        16. [ABSOLUTE] PRESERVE FIXED PRE-ASSIGNMENTS (LOCKS): Under 'existingAssignments' (the Locked shifts constraint), some shifts are already assigned and permanently fixed with 'isLocked: true'. You MUST preserve these exact assignments in your generated 'assignments' array. Do NOT remove, displace, or change them in any way. Count them towards satisfying the daily requirements. Ensure they preserve their original 'departmentId'.

        ### SPECIAL CUSTOM INSTRUCTIONS FROM USER:
        ${customInstructions ? `Please enforce the following preferences, rules, or requests with high priority if possible:
        "${customInstructions}"` : "(None provided)"}

        ### DATA (JSON):
        - YearMonth: ${yearMonth}
        - Staff (users): ${JSON.stringify(staff)}
        - Patterns (shift types): ${JSON.stringify(patterns)}
        - Requirements (daily needs): ${JSON.stringify(requirements)}
        - Submissions (requests): ${JSON.stringify(submissions)}
        - Pair Restrictions: ${JSON.stringify(pairRestrictions)}
        - Existing Assignments (Locked shifts constraint): ${JSON.stringify(existingAssignments?.filter((a: any) => a.isLocked) || [])}

        Generate the 'assignments' array.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text;
      if (!responseText) throw new Error("Empty response from AI");
      const scheduleData = JSON.parse(responseText);

      res.json(scheduleData);
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
