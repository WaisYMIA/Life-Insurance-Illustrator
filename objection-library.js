/* ============================================================
   OBJECTION PLAYBOOK (v2026.11.8) — loaded after market-compare.js.
   Methods from published sales leaders, objections by line (life, medical, general), Kenyan alternatives and how to answer them,
   product edges taken from official Jubilee brochures, and Kenyan proof points with their sources.
   Suggested wording only: adapt to the client, never promise returns, follow the company's sales conduct rules.
   ============================================================ */
(function(root){
const METHODS = [
  { who: 'Brian Tracy', src: 'Unlimited Sales Success (AMACOM, 2014), excerpt published by AMA; Feel-Felt-Found as taught by Tracy per The Sales Experts',
    steps: [
      ['Feel, Felt, Found', 'Acknowledge how they feel; say others felt the same; share what those others found when they looked closer. "I understand how you feel. Many of my clients felt the same. What they found was…"'],
      ['Answer doubts about you or the company straight away', 'If a client questions your integrity or the product\'s reliability, deal with it before anything else: state the official position (what the policy says), then reassure.'],
      ['Defer price until value is built', 'Asked about price too early? Say you will cover it fully in a few minutes, once they have seen what it does for the family, and ask permission to finish your point.'],
      ['If price depends on their details, ask for the details', 'Explain that the premium depends on age, cover and term, ask a few questions, and give a close estimate.'],
      ['Let knee-jerk objections pass', 'Early reflex remarks such as "it must be expensive" can be acknowledged with a nod and a smile; carry on and return to them with the full picture.'],
      ['Plan ahead (the six Ps)', 'Proper prior planning prevents poor performance: list the objections you expect for this client and prepare answers before you meet.']] },
  { who: 'Tom Hopkins', src: 'How Sales Champions Handle Objections (Selling Power, 2010)',
    steps: [
      ['1. Let them finish', 'Never interrupt; interrupting feels pushy and you may answer the wrong objection.'],
      ['2. Echo it back', '"So the monthly amount is the main thing giving you pause?" With couples, one partner often answers the other.'],
      ['3. Dig into it', '"What is it about the timing that concerns you most?" Ask sincerely; people often talk themselves out of it.'],
      ['4. Answer it, and admit real weaknesses', 'Acknowledge a genuine drawback, then pivot to a genuine advantage: "Yes, the surrender value only starts after two years, but the family is protected from day one."'],
      ['5. Confirm it landed', '"Does that clear it up for you?" Do not leave an objection hanging.'],
      ['6. Move on with a cue', 'Turn the page, change posture, then "By the way…" into the next step. Hopkins also says objections are buying signals: people who never object are rarely interested.']] },
  { who: 'Jeffrey Gitomer', src: 'Gitomer\'s published objection-handling steps (gitomer.com)',
    steps: [
      ['Real objection or stall?', 'Let them talk, agree first, so you can differ without arguing.'],
      ['Isolate it', '"Is there any other reason that would stop you?" then "In other words, if it were not for the premium, you would go ahead, is that true?"'],
      ['Build your solution into a question', '"If I could bring the premium down by adjusting the term, would that be enough for you to decide?"'],
      ['Treat "I want to think about it" as a stall', 'Gitomer says about half the time it hides another problem. Find out who else decides and bring them in; offer to think it through together and ask what the main concern is.'],
      ['Price', 'Do not argue the number; show cost against value, give comparisons and proof. Useful questions: "Is that true for you?", "Why is that important to you?"']] },
  { who: 'A flow you can use in every meeting (our synthesis of the three)', src: 'Combined by us; not a quotation',
    steps: [
      ['Listen and echo', 'Let them finish, repeat the concern in your words.'],
      ['Find the real reason', 'Ask one gentle question; isolate it: "Is that the only thing?"'],
      ['Acknowledge, then answer with Feel-Felt-Found or a straight fact', 'Admit real limits. Use Kenyan proof points where they help.'],
      ['Confirm and move on', '"Does that answer it?" Then propose the next small step: the illustration, the spouse call, the medical form.']] }
];

/* line: life | medical | general | all.  group: Trust | Culture | Money | Timing | Product | Family */
const OBJ = [
 // ---------- ALL LINES: trust ----------
 { id:'t1', line:'all', group:'Trust', q:'"Insurance companies do not pay claims."',
   real:'A story they heard, or a bad experience with slow or denied claims. In Kenya this is the most common root of the whole refusal.',
   say:'You are right to ask, and I will not brush it off. Claims are paid when the policy terms are met, and most disputes start with something that was not disclosed or an exclusion nobody explained. So I will go through the questions with you honestly, show you the exclusions in plain words, and explain exactly how a claim is made, before you sign anything.',
   ask:'Was it your own experience or someone you know? What happened?',
   proof:'Published commentary on Kenyan claims describes customers who were never meaningfully told about exclusions, and dense language at sale (The Star, May 2026). Disclosing plainly at the point of sale is the fix the industry itself recommends. Do the same.',
   avoid:'Do not defend the whole industry or promise that your claim will never be rejected.', method:'Tracy: answer credibility doubts first; Hopkins: admit weaknesses' },
 { id:'t2', line:'all', group:'Trust', q:'"My friend\'s claim was rejected."',
   real:'They fear the same thing happening to them.',
   say:'I am sorry that happened. Many people have felt the same way after hearing a story like that. What they found, when we went through their own policy, is that most rejections come from non-disclosure, a waiting period or an exclusion. That is why I will sit with you on every question on the form, and leave you a written summary of what is and is not covered.',
   ask:'Do you know why the claim was rejected?', proof:'IRA data on rejected claims exists in the press, but figures vary by class and quarter: quote none from memory; if you want one, bring the current IRA release.',
   avoid:'Do not say the friend was wrong or "did not read the policy".', method:'Tracy: Feel-Felt-Found' },
 { id:'t3', line:'all', group:'Trust', q:'"Agents just want their commission."',
   real:'Past experience of being sold a product that did not fit.',
   say:'That is a fair concern and the way to test me is to watch whether I ask about your goals before I mention a plan. I will tell you what a plan does not do as well as what it does, and if a different product or even not buying is the better choice for you, I will say so.',
   ask:'What would I need to do to earn your confidence in this conversation?', proof:'Local commentary describes insurance as still largely "sold" rather than "bought", with mis-selling concerns (Lux Actuaries). Showing the limits yourself is the strongest answer.',
   avoid:'Do not get defensive or talk about your own targets.', method:'Hopkins: admit weaknesses' },
 { id:'t4', line:'all', group:'Trust', q:'"What if the company collapses?"',
   real:'They remember insurer failures, or fear paying for years and losing it.',
   say:'It is sensible to check. In Kenya insurers are licensed and regulated by the Insurance Regulatory Authority, and you can confirm that for any company you consider. What I can do is show you the licence and the policy document, and explain what is guaranteed in writing versus what is only illustrated.',
   ask:'What would you want to see to feel comfortable about the company\'s standing?', proof:'Jubilee Life is a subsidiary of Jubilee Holdings, with subsidiaries in Tanzania, Uganda, Mauritius and Burundi (official Fanaka brochure). Past insurer failures dented confidence; regulatory reforms followed (Lux Actuaries).',
   avoid:'Do not claim the company "can never fail" or quote rankings you cannot show.', method:'Tracy: answer credibility directly' },
 { id:'t5', line:'all', group:'Trust', q:'"Insurance is a scam: you pay for years and never use it."',
   real:'They see insurance as a lost expense if nothing happens.',
   say:'I understand the feeling: no one celebrates a policy they never claimed on. That is exactly how a fire extinguisher works: you hope never to use it. If you want something you will see again, we can look at a savings plan that pays out at maturity, so the money comes back to you and protection is built in.',
   ask:'Which would feel better to you: paying for protection, or saving with protection included?', proof:'', avoid:'Do not promise a "return" on pure protection.', method:'Feel-Felt-Found' },
 // ---------- culture ----------
 { id:'c1', line:'life', group:'Culture', q:'"Buying life cover is inviting death."',
   real:'A cultural or superstitious fear. Some see it as "predicting their own death" (Lux Actuaries).',
   say:'Many of my clients felt the same way at first. What they found is that cover does not make anything happen: it only means the people they love are not left with the bill. Many call it a gift to the family, like planning a home or school fees.',
   ask:'If something did happen, what would you want your family to be able to do?', proof:'', avoid:'Do not use death imagery or pressure; keep it about the family\'s plans.', method:'Tracy: Feel-Felt-Found' },
 { id:'c2', line:'life', group:'Culture', q:'"God is my provider."',
   real:'Faith is central; they may feel insurance replaces trust.',
   say:'I respect that. Many believers see planning as part of being a good steward of what they have been given: working, saving and protecting the family. Cover is simply one way of caring for your children if you are not there to provide.',
   ask:'How do you see taking care of your family\'s needs in practice?', proof:'', avoid:'Do not argue theology or quote scripture back at them.', method:'Hopkins: echo and dig' },
 { id:'c3', line:'life', group:'Culture', q:'"My relatives and the community will take care of the family."',
   real:'Strong extended-family and harambee tradition.',
   say:'That support is precious and I hope it is always there. The question is how much it can carry: school fees and rent for years are a heavy request to place on others. A policy means the support is a top-up, not the whole plan, and no one is burdened.',
   ask:'If your children needed school fees for ten more years, who could give that, and would they be able to?', proof:'', avoid:'Do not belittle the family network.', method:'Hopkins: dig' },
 // ---------- money ----------
 { id:'m1', line:'all', group:'Money', q:'"I cannot afford it."',
   real:'Could be a true budget limit, or a way to end the meeting. Isolate it before you adjust the number (Gitomer; Tracy).',
   say:'Thank you for being open. Let us start from the amount you could set aside each month without feeling it, and build the plan around that: a smaller sum assured, a longer term, or a payment date that matches when your income arrives can all bring it down.',
   ask:'If the monthly amount were not a problem, would you go ahead? Which amount would you hardly notice?', proof:'Affordability and irregular incomes are the most-cited reasons in the GeoPoll survey reported by The Star (Nov 2025).',
   avoid:'Do not push the biggest plan or imply they are "not serious".', method:'Gitomer: isolate; Tracy: defer price until value is built' },
 { id:'m2', line:'all', group:'Money', q:'"My income is irregular (hustle, business, farming)."',
   real:'Most products assume a steady monthly salary.',
   say:'That is common, and the plan should fit it, not the other way round. We can choose a payment frequency that matches your good months, such as quarterly or annual, and keep the commitment small so it stays comfortable in lean months. We will also check what happens if you miss a payment, so there are no surprises.',
   ask:'In which months is your income strongest?', proof:'Lux Actuaries notes that the informal sector is a very large share of Kenyan workers and that most products assume stable monthly income.',
   avoid:'Do not sign a premium the client may not be able to keep paying.', method:'Hopkins: dig' },
 { id:'m3', line:'life', group:'Money', q:'"I already save in a SACCO or chama."',
   real:'They trust a vehicle they know, and it also gives loans.',
   say:'That is a good habit and I would keep it. A SACCO is excellent for loans and growth. What it does not do is pay your family if something happens to you before the goal is reached. This sits beside it: the cover completes the plan and the fixed commitment keeps you from dipping into the money.',
   ask:'If you were not around, would your SACCO savings complete the goal for your family?', proof:'SACCO returns vary with governance and performance and are not guaranteed (Serrari comparison, 2026); share capital can be tied up while membership continues.',
   avoid:'Do not say SACCOs are risky or tell them to leave.', method:'Tracy: Feel-Felt-Found; Hopkins: admit and pivot' },
 { id:'m4', line:'life', group:'Money', q:'"A money market fund pays more."',
   real:'They compare headline yields.',
   say:'Money market funds are easy to enter and withdraw from, and they are a good place for emergency money. A life plan does something different: it adds protection and a commitment device. If you die in year three, a fund holds only what you put in; a plan can pay the sum assured. Many clients keep both.',
   ask:'What is the money for, and when do you need it?', proof:'MMF withdrawals typically clear in 24 to 72 hours, earnings carry 15% withholding tax, and returns are not guaranteed (Serrari comparison, 2026).',
   avoid:'Do not misquote yields; use figures only from a current, named source.', method:'Hopkins: admit weakness and pivot' },
 { id:'m5', line:'life', group:'Money', q:'"I would rather buy land or a plot."',
   real:'Land feels safe, visible and inheritable.',
   say:'Land is a strong long-term asset and I would not tell you not to buy it. A plan helps in the moments land cannot: it is cash when a family needs it fast, it needs no valuation or sale, and it can cover loans or succession costs so the land does not have to be sold in a hurry.',
   ask:'If you died tomorrow, how would your family pay the loan and expenses without selling the land?', proof:'', avoid:'Do not compare land returns with policy returns.', method:'Hopkins: answer with advantage' },
 { id:'m6', line:'life', group:'Money', q:'"The returns are too low."',
   real:'They expect an investment, not protection plus savings.',
   say:'It is right to compare. A plan with protection built in is priced differently from a pure investment: part of what you pay buys the cover and the waiver, and the plan fits people who want a disciplined, protected route. If maximum growth is the goal, we can look at an investment-linked option and be clear that returns are not guaranteed.',
   ask:'What matters more to you: the highest possible growth, or being sure the goal is met even if something happens?', proof:'', avoid:'Never quote a return as certain; show the lower illustrated rate too.', method:'Hopkins: confirm' },
 { id:'m7', line:'life', group:'Money', q:'"Inflation will eat the value."',
   real:'A thoughtful concern about long-term money.',
   say:'It is a real risk for any fixed amount over a long term. That is why we look at the plan together with the goal: a bonus-based plan builds extra over time, and an investment-linked plan lets the fund grow, with the caveat that it is not guaranteed. We can also review the cover as your income rises.',
   ask:'How long is the money meant to work?', proof:'', avoid:'Do not promise to beat inflation.', method:'Hopkins: answer' },
 // ---------- timing ----------
 { id:'tm1', line:'all', group:'Timing', q:'"Let me think about it."',
   real:'About half the time another concern is hiding (Gitomer). The other half will buy.',
   say:'Of course: it is an important decision. So that I leave you with something useful, which part would you like to think about: the amount, the term, or how it works? I will leave you a one-page summary, and call you on a day we agree to answer questions.',
   ask:'Is there anything about what we covered that I have not made clear? Who else would you like to include?', proof:'', avoid:'Do not chase with calls the same afternoon.', method:'Gitomer: stall vs real; ask what the main concern is' },
 { id:'tm2', line:'all', group:'Timing', q:'"I need to ask my spouse."',
   real:'A genuine joint decision, or a polite exit.',
   say:'That is wise, since it affects the whole household. Would it help if I prepared a short summary you can share on WhatsApp, and joined a call or visit when you are both free? Then your spouse can ask me directly.',
   ask:'What do you think your spouse will ask first?', proof:'', avoid:'Do not push the client to decide without the partner.', method:'Gitomer: bring all decision-makers in' },
 { id:'tm3', line:'all', group:'Timing', q:'"Come back next month."',
   real:'Cash-flow timing, or avoidance.',
   say:'Of course. For next month to be useful, which part should I prepare? Because premiums are based on your age and health today, a short wait is fine but a long one costs more. I will message you before then.',
   ask:'What will be different next month?', proof:'', avoid:'Do not use false urgency.', method:'Gitomer: isolate' },
 { id:'tm4', line:'life', group:'Timing', q:'"I am young and healthy; I do not need it yet."',
   real:'Death feels far away, and cash is needed now.',
   say:'Being young is the cheapest and easiest time: cost is based on your age and health today and you keep that advantage for the whole term. Does anyone rely on your income, such as parents or siblings, or is there a loan someone else would have to repay?',
   ask:'Who depends on you today?', proof:'', avoid:'Do not use fear.', method:'Tracy: Feel-Felt-Found' },
 { id:'tm5', line:'life', group:'Timing', q:'"I am too old now."',
   real:'They believe it is too late or too costly.',
   say:'There are plans for later ages; the cost is higher than at 30, but the need is often stronger. Let us check the age limits for the plans that fit your goal and see what is possible, including covers without a medical test up to a limit.',
   ask:'What would you most want covered: funeral costs, a loan, or something for the children?', proof:'Entry ages differ by plan: for example Smart Save 18 to 65, Smart Scholar 18 to 50 (official brochures).',
   avoid:'Do not promise acceptance before underwriting.', method:'Hopkins: dig' },
 // ---------- product ----------
 { id:'p1', line:'life', group:'Product', q:'"Can I get my money back if I stop?"',
   real:'They fear being locked in.',
   say:'Let me be clear: these plans are designed to be kept to the end. If you stop early you may get back less than you paid, or nothing, depending on the plan and how long it ran. I will show you the figures for your plan so you decide with that in mind. If you may need the money sooner, we should look at something more flexible.',
   ask:'Could you keep paying for the whole term even in a tight year?', proof:'Example: Smart Scholar and Smart Save build a surrender value only after 24 months of fully paid premiums; Faida Elimu has early-withdrawal charges for the first 36 months (official brochures).',
   avoid:'Never hide the early-exit loss.', method:'Hopkins: admit weakness' },
 { id:'p2', line:'life', group:'Product', q:'"Are the bonuses and returns guaranteed?"',
   real:'They need certainty.',
   say:'No, and I want you to know that. Illustrated bonuses and fund values are estimates and can be higher or lower. What is guaranteed is written in the policy: for example the sum assured. I will also show the illustration at a lower assumed rate so you see the range.',
   ask:'Does that range work for your goal?', proof:'Smart Save and Smart Scholar bonuses are "up to 4%" a year and declared annually; Faida plans state that past performance is no guarantee (official brochures).',
   avoid:'Never present illustrated figures as certain.', method:'Hopkins: admit weakness' },
 { id:'p3', line:'life', group:'Product', q:'"My employer already covers me."',
   real:'Group life feels like enough.',
   say:'Good, that is a solid base. Employer cover usually ends when you leave or retire and is often a multiple of salary. Let us check what it would leave your family, and what would continue if you changed jobs.',
   ask:'How many times your salary is it, and what happens to it if you leave?', proof:'Few Kenyan employers provide life cover as a benefit, though some include funeral cover within medical (Lux Actuaries); check your client\'s actual scheme.',
   avoid:'Do not assume the cover is small without asking.', method:'Hopkins: dig' },
 { id:'p4', line:'life', group:'Product', q:'"I have funeral cover or a burial society."',
   real:'They feel the main cost is covered.',
   say:'Good, funerals are a real cost and cover for them is wise. It does not replace income or pay school fees and rent afterwards. Let us see if what you have also covers your spouse and children, and how quickly it pays.',
   ask:'Beyond the funeral, how would the family manage the months and years after?', proof:'Jubilee plans offer a last expense benefit of KES 100,000 paid within 48 hours of documents (official brochures); confirm the exact rider on the client\'s plan.',
   avoid:'Do not downplay funeral cover.', method:'Hopkins: answer with advantage' },
 { id:'p5', line:'life', group:'Product', q:'"Unit-linked investing is risky."',
   real:'They fear losing money.',
   say:'The value can go down as well as up, so the plan should suit how you feel about risk. If the fund value dropped for a year, would that worry you? If so, a plan with a more predictable structure may fit better, and we can compare the two side by side.',
   ask:'How would you feel if the value fell for a year?', proof:'', avoid:'Do not push an investment-linked plan on a nervous client.', method:'Gitomer: question' },
 { id:'p6', line:'life', group:'Product', q:'"It is too long a commitment."',
   real:'They fear their situation will change.',
   say:'That is fair: life does change. We can choose the shortest term that still meets your goal, and check what happens if you need to stop. Some plans allow loans or paid-up options after two years, which gives you some flexibility.',
   ask:'When do you need the money?', proof:'Policy loans and paid-up options after two years (Smart Scholar and Smart Save brochures).', avoid:'Do not overstate flexibility.', method:'Hopkins: answer' },
 { id:'p7', line:'life', group:'Product', q:'"I do not understand it; it is too complicated."',
   real:'They are embarrassed to say so, or they were burnt by small print.',
   say:'Thank you for saying so: it is my job to explain it clearly. Let us do it in three lines: what you pay, what the family gets if you die, and what you get if you live to the end. I will go through the exclusions slowly and leave you a summary.',
   ask:'Which part should I explain again?', proof:'Minet Kenya\'s claims conference urged plain explanation of terms at the point of sale (The Star, May 2026).', avoid:'Do not use jargon to sound expert.', method:'Hopkins: let them finish; echo' },
 { id:'p8', line:'life', group:'Product', q:'"I am afraid of the medical exam and questions."',
   real:'Fear of being turned down or of a hidden illness being found.',
   say:'It is a common worry. The form is there to price the plan fairly and to protect your family\'s claim later, so complete and honest answers matter. For lower cover amounts there may be no medical test, and if the results show higher risk the premium is adjusted rather than the application simply refused.',
   ask:'Is there anything you would like me to understand before we fill it in?', proof:'Example: Smart Save and Smart Scholar require medical reports for ages 54 and above and for sums above KES 7.5 million; if results show higher risk the premium is adjusted (official brochures).',
   avoid:'Do not advise the client to leave anything out.', method:'Hopkins: dig' },
 { id:'p9', line:'life', group:'Product', q:'"What if I miss a premium?"',
   real:'They fear losing everything.',
   say:'Good question to ask before signing. Benefits depend on premiums being fully paid at the time of a claim, so I will show you what happens at one, two and three missed payments for your plan, and how to set up reminders or a payment method that suits you.',
   ask:'What is the easiest way for you to pay on time?', proof:'Official brochures state benefits are subject to premiums being fully paid at the time of claim.', avoid:'Do not play down lapse risks.', method:'Hopkins: admit weakness' },
 { id:'p10', line:'life', group:'Product', q:'"What does tax relief mean for me?"',
   real:'They are curious about the benefit, or testing for an angle.',
   say:'If you pay tax to KRA, qualifying premiums can reduce your tax: 15% of the premium, up to a yearly limit. It helps, but it is not the reason to buy: the plan should make sense for your goal first.',
   ask:'Do you pay PAYE or file your own returns?', proof:'Illustrations show tax relief; the limit and the conditions are set by the tax law, so check the current rule.', avoid:'Do not sell it as a tax product.', method:'Tracy: value first' },
 // ---------- medical ----------
 { id:'md1', line:'medical', group:'Product', q:'"I have SHA / SHIF, so I am covered."',
   real:'They believe the government scheme is enough, and they already pay 2.75%.',
   say:'SHA is a useful base for hospital costs and everyone contributes the same share of income for the same standard of care. It is not designed to give you a choice of hospital or private rooms. Even the Ministry\'s PS has said that those who want extras can take private cover. Let us see what you would want that SHA does not give you.',
   ask:'Where would you want to be treated, and what would worry you most if you were sick?', proof:'SHIF is a 2.75% contribution on income; PS Harry Kimtai advised those wanting more to buy private cover (Kenyans.co.ke, 31 Oct 2024). Check current SHA benefits, as they change.',
   avoid:'Do not criticise SHA or make claims about its failures you cannot source.', method:'Hopkins: admit and pivot' },
 { id:'md2', line:'medical', group:'Product', q:'"I am healthy; I rarely go to hospital."',
   real:'They see medical cover as a cost for the unhealthy.',
   say:'That is great, and it is what the cover is for: the day you do need it, the bill can be big and sudden: an accident or an operation. You pay a small amount for the large unexpected one, and you keep your savings.',
   ask:'If a bill of several hundred thousand shillings came tomorrow, where would it come from?', proof:'', avoid:'Avoid scare stories.', method:'Tracy: Feel-Felt-Found' },
 { id:'md3', line:'medical', group:'Product', q:'"The premiums go up every year."',
   real:'They have felt age and claims loading at renewal.',
   say:'That is true of most medical plans: renewal reflects age and claims experience across the pool. I will show you how the premium may change, what the limits are for each benefit, and what a lower cover or a co-payment would do to the cost.',
   ask:'Which matters more: a lower premium or higher limits?', proof:'Consumers are told to demand written explanations of new health insurance costs from the insurer (Business Daily, Mar 2025).', avoid:'Never promise stable premiums.', method:'Hopkins: admit weakness' },
 { id:'md4', line:'medical', group:'Product', q:'"Pre-existing conditions will not be covered."',
   real:'They or someone in the family has a condition.',
   say:'Different plans treat conditions differently: some exclude them, some apply a waiting period. I will check the plan wording for what applies to you, and be honest if the exact condition you worry about is excluded, so you can decide with all the facts.',
   ask:'What would you most want covered?', proof:'', avoid:'Do not ask the client to hide or minimise a condition.', method:'Hopkins: admit weakness' },
 { id:'md5', line:'medical', group:'Product', q:'"The hospital rejected my card (or the cover has limits)."',
   real:'Past experience with limits, panels or pre-authorisation.',
   say:'Thank you for telling me. Often the issue is a limit that was reached, a hospital outside the panel, or an approval that was missing. I will show you the panel, the limits per benefit and how to get approval, so you know before you need it.',
   ask:'What happened at the hospital?', proof:'More than half of IRA complaints involve long waits, low payments or no explanation (The Star, May 2026).', avoid:'Do not defend the insurer before hearing the story.', method:'Hopkins: let them finish; echo' },
 { id:'md6', line:'medical', group:'Product', q:'"My employer has medical cover for me."',
   real:'They do not think about their family or about leaving the job.',
   say:'Good. It often covers only the employee and a few dependants, and it ends when you leave the job. Let us check what it includes for your spouse and parents, and what you would do about medical cover if you were between jobs.',
   ask:'Who in your family is not covered by it?', proof:'', avoid:'Do not guess the scheme\'s limits.', method:'Hopkins: dig' },
 // ---------- general ----------
 { id:'g1', line:'general', group:'Product', q:'"Third party is enough for my car."',
   real:'Price: they want the legal minimum.',
   say:'Third party covers the damage you cause to others; it does not pay to repair or replace your own car. If your car is financed or it is your livelihood, an accident could cost you far more than the difference. Let us see the difference in price for your vehicle and what each would pay.',
   ask:'If your car were written off next month, how would you replace it?', proof:'', avoid:'Do not hide that third party is legally compliant for the minimum.', method:'Tracy: defer price until value shown' },
 { id:'g2', line:'general', group:'Trust', q:'"A cheaper quote from someone else."',
   real:'Price focus, possibly an unlicensed or fake cover.',
   say:'Price matters, so let us compare what each quote actually covers: the sum insured, excess, exclusions and who pays when there is a claim. A very cheap quote can mean limited cover or a cover that does not exist. I will show how to check that the insurer is licensed.',
   ask:'Can I see the quote so we can compare it line by line?', proof:'Motor insurance leads fraud cases in Kenya and the State has moved against rogue insurers in the PSV sector (IRA report; Kenyans.co.ke).',
   avoid:'Do not name or attack a competitor; compare the wording.', method:'Gitomer: forget price, show value' },
 { id:'g3', line:'general', group:'Trust', q:'"Motor claims take forever."',
   real:'A past experience with assessors and garages.',
   say:'That does happen, and I will not pretend otherwise. What helps is the process: report quickly, use a garage on the approved list, keep the documents together, and I will follow up with you. I will show you the steps and who to call.',
   ask:'What happened when you claimed?', proof:'Complaints to the IRA have risen, mostly over waiting too long or being paid too little (The Star, May 2026).', avoid:'Do not promise claim timelines.', method:'Hopkins: echo and dig' },
 { id:'g3b', line:'general', group:'Money', q:'"I have never had an accident. I will risk it."',
   real:'Past luck; cost avoidance.',
   say:'You have been careful, and I hope it continues. The cover is not about your driving: it is for what other people or the weather do. One accident can cost more than years of premiums.',
   ask:'What would one big accident bill mean for you?', proof:'', avoid:'Do not use shock stories.', method:'Tracy: Feel-Felt-Found' },
 { id:'g4', line:'general', group:'Product', q:'"My house is small; property cover is not needed."',
   real:'They think it is for the rich.',
   say:'The cover is based on what it would cost to rebuild and replace your things, not on how big the house is. For many families those items are everything they own. A small cover for fire, flood and burglary can be affordable.',
   ask:'If a fire destroyed your home contents, how would you replace them?', proof:'Press reporting describes growing disputes over fire and flood claims (Business Daily); explain terms and sums insured clearly at sale.', avoid:'Do not over-insure.', method:'Hopkins: dig' },
 { id:'g5', line:'general', group:'Product', q:'"Boda boda and personal accident cover: I cannot afford it."',
   real:'Daily income is tight and accidents feel unavoidable.',
   say:'Riders face the highest risk and the smallest cushion, which is why a low-cost personal accident cover can be a lifeline. We can choose a basic benefit and a payment option that fits the days you earn.',
   ask:'If you could not ride for two months, how would your family manage?', proof:'Press reports describe cases where boda boda insurance fails riders when accidents happen (The Standard); explain exactly what the cover pays and does not pay.', avoid:'Do not sell a policy the rider does not understand.', method:'Tracy: value first' }
];

/* Kenyan alternatives to compare against. concede = where they genuinely win; gap = what they do not do; edge = what a life plan adds; bridge = a question to move forward. */
const VS = [
 { id:'v1', name:'SACCO / chama savings', cat:'endowment-savings',
   concede:'Loans, dividends, community, and easy access to a lump sum.', gap:'No cover if you die or are disabled before the goal; returns depend on the SACCO\'s performance and are not guaranteed.',
   edge:'Protection plus a commitment device: the goal is funded even if you cannot continue; premiums are waived on death or disability in education plans such as Smart Scholar and Faida Elimu.',
   bridge:'Would your SACCO savings finish the plan if you were not here?', caution:'Do not call SACCOs risky; recommend using both.' },
 { id:'v2', name:'Money market funds (and mobile-wallet funds)', cat:'investment-linked',
   concede:'Low entry, fast access (often 24 to 72 hours), easy to start.', gap:'No life cover, withholding tax applies to earnings, and returns move with the market.',
   edge:'Cover, premium waiver and discipline. An investment-linked plan such as Faida Elimu or Faida Elite also gives a managed fund with life cover.',
   bridge:'Which part is emergency money, and which is for a goal that must be met?', caution:'Use a named, current source for any yield; never quote old figures.' },
 { id:'v3', name:'Bank savings and fixed deposits', cat:'endowment-savings',
   concede:'Safe, simple, instantly understood.', gap:'Interest only: no protection, and it is easy to withdraw the savings.',
   edge:'Death benefit from day one, bonuses on top, and a structure that discourages dipping into the money.',
   bridge:'Is it easy for you to leave that money untouched for 10 years?', caution:'Do not disparage banks; many clients buy through banks too.' },
 { id:'v4', name:'Land and plots', cat:'whole-life',
   concede:'Visible, inheritable, often appreciating.', gap:'Illiquid; a sudden loan or funeral may force a hurried sale.',
   edge:'Cash for the family when it is needed, and for succession costs; Faida Maisha offers whole life cover from KES 1 million to KES 200 million.',
   bridge:'How would the family meet costs without selling land at a bad time?', caution:'Do not compare returns.' },
 { id:'v5', name:'Treasury bills and bonds', cat:'investment-linked',
   concede:'Government-backed, predictable yield for the term.', gap:'No cover, no waiver, and a large minimum for some issues.',
   edge:'Protection for the person who is saving, and flexible amounts.',
   bridge:'What happens to the goal if the saver is no longer there?', caution:'Do not quote current yields from memory.' },
 { id:'v6', name:'NSSF and employer pension', cat:'pension-retirement',
   concede:'Automatic, employer-funded, tax-advantaged.', gap:'Often a modest amount; self-employed and informal workers have no employer to fund it.',
   edge:'A personal plan or pension tops it up and moves with the client between jobs.',
   bridge:'What monthly income will you need at 60, and what will NSSF give?', caution:'Check current NSSF rules before quoting.' },
 { id:'v7', name:'SHA / SHIF vs private medical', cat:'other',
   concede:'Universal, 2.75% of income, funds a common standard of care.', gap:'A uniform standard of care; limited choice and extras.',
   edge:'Private cover for choice of hospitals and extras; the PS himself advised private cover for extras (Oct 2024).',
   bridge:'What would you want that a standard scheme does not give?', caution:'Keep claims about SHA factual and sourced.' },
 { id:'v8', name:'Another insurer\'s similar product', cat:'education',
   concede:'Many Kenyan insurers sell good education, savings and whole life plans.', gap:'Differences are in the detail: payout triggers, waiver terms, entry age, charges, surrender rules.',
   edge:'Compare facts side by side in the Market tab: for example, Smart Scholar pays 50% of the sum assured at once on the parent\'s death, waives premiums, and still pays the maturity benefit.',
   bridge:'Can we put the two illustrations next to each other?', caution:'Compare only facts you can show; never run down another company.' },
 { id:'v9', name:'Funeral cover, burial societies and chama welfare', cat:'funeral-family-protection',
   concede:'Cheap, fast, culturally trusted.', gap:'Usually limited to funeral costs; the family\'s income needs remain.',
   edge:'Add last expense plus income protection: Jubilee last expense benefit is KES 100,000 within 48 hours of documents (official brochures).',
   bridge:'Beyond the funeral, how long could your family manage on its own?', caution:'Do not dismiss funeral cover.' },
 { id:'v10', name:'Bancassurance (a policy offered by the bank)', cat:'credit-mortgage',
   concede:'Convenient, comes with the loan or account.', gap:'Often tied to the loan and may stop when the loan ends; products may be limited.',
   edge:'A personal plan is portable, chosen for the family\'s goal, and not tied to one lender.',
   bridge:'Whom does the bank\'s cover pay, you or the lender?', caution:'Check the actual policy before saying anything specific.' },
 { id:'v11', name:'Digital and micro-insurance on a phone', cat:'funeral-family-protection',
   concede:'Fast, small premiums, easy start, aligned to M-Pesa.', gap:'Usually small benefits and short terms; not designed for long-term goals.',
   edge:'Long-term goals, bonuses or fund growth, and larger covers.',
   bridge:'Is the cover big enough to replace what your family would lose?', caution:'Check that any competitor mentioned is licensed.' },
 { id:'v12', name:'Cheap, unlicensed or "mtaani" cover', cat:'other',
   concede:'It is cheap and quick.', gap:'May not exist when a claim arrives; the sector has seen fraud and rogue operators.',
   edge:'A licensed insurer under IRA regulation and a written policy.',
   bridge:'Shall we check together that the cover is genuine?', caution:'Do not name anyone; teach the client how to check the licence.' }
];

/* Our edge: factual points from Jubilee's own brochures, grouped by the client need. */
const EDGE = [
 { need:'Education', plan:'Smart Scholar', pts:['On the parent\'s death, 50% of the sum assured is paid immediately, future premiums are waived, the policy continues and 100% of the sum assured plus bonuses is paid at maturity.','Premiums waived on total and permanent disability.','From KES 2,000 a month or KES 100,000 single premium; terms of 8 to 18 years.','Optional child accident hospitalisation (up to 40% of sum assured, maximum KES 250,000) and last expense cover for the child (KES 50,000).'], watch:'Entry age 18 to 50; bonuses up to 4% a year are declared, not guaranteed.' , cat:'education' },
 { need:'Education (fund value)', plan:'Faida Elimu', pts:['Premiums go into a managed fund; 100% of the fund value is paid at maturity.','Premium waiver on death or total and permanent disability (not for single premium).','Entry age 18 to 65, terms 5 to 15 years, top-ups at any time.','KES 100,000 last expense benefit within 48 hours of documents.'], watch:'Returns not guaranteed; 4% fund management fee and early-withdrawal charges in the first 36 months.', cat:'education' },
 { need:'Savings for a goal', plan:'Smart Save', pts:['Death pays 100% of sum assured plus accrued bonuses plus a terminal bonus, immediately.','Maturity pays the same: sum assured, bonuses and terminal bonus.','From KES 2,000 a month; entry age 18 to 65; terms 5 to 20 years.','Optional waiver of premium on disability, accidental death, and last expense.'], watch:'Bonuses declared annually, not guaranteed; surrender value only after 24 months.', cat:'endowment-savings' },
 { need:'Project, home or business capital', plan:'Fanaka', pts:['Terms of 11 to 20 years: 120% of the sum assured plus bonus at maturity; 175% plus double the bonus on death in the term.','Fixed premium and sum assured from the start.','Entry age 18 to 65; minimum sum assured KES 350,000.','Riders include waiver, accident hospitalisation and last expense.'], watch:'Terms of 5 to 10 years pay only 75% of the sum assured plus bonus on death; tell clients plainly.', cat:'endowment-savings' },
 { need:'Legacy and estate', plan:'Faida Maisha', pts:['Whole life cover from KES 1 million to KES 200 million, plus an investment fund.','Death benefit: last expense benefit, plus whole life cover, plus 100% of fund value.','Premium paying term 5 to 15 years; cover for life.','Partial and full withdrawals of the fund after the premium-paying term.'], watch:'Two premiums to explain; 4% fund fee; fund returns not guaranteed.', cat:'whole-life' },
 { need:'Company standing', plan:'Jubilee Life', pts:['Jubilee Life is a wholly owned subsidiary of Jubilee Holdings, with subsidiaries in Tanzania, Uganda, Mauritius and Burundi.','Regulated by the Insurance Regulatory Authority (as printed on the brochures).'], watch:'Do not quote market rankings or claim ratios unless you have a current, sourced figure.', cat:'' }
];

const FACTS = [
 { t:'Insurance penetration in Kenya is 2.4% of GDP, below the Africa average of 3.5% and the global average of 7.4%.', src:'Allianz Global Insurance Report 2025, quoted in The Star commentary, 10 May 2026' },
 { t:'IRA complaints have risen about 26%, with general insurance bearing the brunt; more than half involve waiting too long, being paid too little, or never being told why.', src:'The Star commentary, 10 May 2026' },
 { t:'Life insurance penetration is about 1.3% of GDP in Kenya.', src:'Lux Actuaries, "Overcoming life insurance challenges in Kenya"' },
 { t:'Reasons Kenyans give for not buying: affordability and high premiums, unpredictable incomes, limited understanding, mistrust of insurers, and bad past experiences of slow or denied claims and mis-selling.', src:'GeoPoll survey reported by The Star, 20 Nov 2025 (no percentages published)' },
 { t:'Insurance is still largely "sold" rather than "bought"; some Kenyans see cover as "predicting their own death"; term and funeral products are unpopular with agents because commissions are low.', src:'Lux Actuaries' },
 { t:'SHIF is a flat 2.75% of income and gives a uniform standard of care; the Ministry PS advised those wanting extra to take private cover.', src:'Kenyans.co.ke, 31 Oct 2024' },
 { t:'Money market funds: withdrawals in about 24 to 72 hours, 15% withholding tax on earnings, returns not guaranteed. SACCOs: dividends plus interest that vary with governance, share capital often locked while a member.', src:'Serrari comparison, "Money Market Fund vs SACCO 2026" (approximate, undated)' },
 { t:'Kenyan insurers are urged to disclose terms plainly at the point of sale, give claims a single owner, and keep human judgement in claims.', src:'Minet Kenya Claims Conference, reported in The Star, 10 May 2026' }
];
const LINES = [['all', 'All', 'Zote'], ['life', 'Life', 'Maisha'], ['medical', 'Medical', 'Matibabu'], ['general', 'General', 'Jumla']];
const filterObj = (list, o) => { const q = (o.q || '').trim().toLowerCase(); return list.filter(x => (!o.line || o.line === 'all' || x.line === o.line || x.line === 'all') && (!o.group || o.group === 'all' || x.group === o.group) && (!q || [x.q, x.say, x.real, x.ask, x.proof].join(' ').toLowerCase().includes(q))); };
const PURE = { METHODS, OBJ, VS, EDGE, FACTS, filterObj };
if(typeof module !== 'undefined' && module.exports) module.exports = PURE;
if(!root || !root.AgentTools || root.__objLib) return; root.__objLib = true;

/* ======================= browser part ======================= */
const T = root.AgentTools, { showPanel, esc, L, $, $$, toast } = T;
const CSS = `.ob-card{border:1px solid var(--line,#e6dcdc);background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;} .ob-q{font-size:16px;font-weight:700;margin:0 0 6px;color:var(--brand-dark,#5a1020);} .ob-say{font-size:14.5px;line-height:1.5;margin:6px 0;} .ob-h{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#6b5b5b);margin:10px 0 2px;font-weight:700;} .ob-p{font-size:14px;line-height:1.45;margin:0;} .ob-det{border-top:1px solid var(--line,#e6dcdc);margin-top:8px;padding-top:2px;} .ob-det summary{cursor:pointer;font-weight:600;font-size:13.5px;padding:8px 0;min-height:36px;} .ob-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;} .ob-method{font-size:12px;color:var(--muted,#6b5b5b);margin-top:8px;} .ob-in{width:100%;box-sizing:border-box;padding:10px;border:1.5px solid var(--line,#e6dcdc);border-radius:10px;font:15px system-ui,sans-serif;margin:4px 0;}`;
function injectCss(){ if($('#obCss')) return; const s = document.createElement('style'); s.id = 'obCss'; s.textContent = CSS; document.head.appendChild(s); }
const TABS = [['methods', 'Methods', 'Mbinu'], ['obj', 'Objections', 'Pingamizi'], ['vs', 'Versus alternatives', 'Dhidi ya njia mbadala'], ['edge', 'Our product edge', 'Nguvu ya bidhaa'], ['facts', 'Kenya proof points', 'Takwimu za Kenya']];
const copy = async t => { try{ await navigator.clipboard.writeText(t); toast(L('Copied.', 'Imenakiliwa.')); }catch(e){} };
function open(){
  injectCss();
  showPanel(L('Objection playbook', 'Mwongozo wa pingamizi'), body => {
    const o = { tab: 'obj', line: 'all', group: 'all', q: '' };
    const draw = () => {
      let html = `<p class="ag-fine" style="margin-top:0;">${esc(L('Suggested wording only. Adapt it to the client, never promise returns, and follow the company\'s sales conduct rules. English for now; the original Pitch cards also have Kiswahili.', 'Maneno yanayopendekezwa tu. Yarekebishe kulingana na mteja, usiahidi faida, na ufuate kanuni za mauzo za kampuni. Kwa sasa ni Kiingereza; kadi za awali za Hoja zina Kiswahili.'))}</p>
        <div class="ob-chips" role="group" aria-label="${esc(L('Sections', 'Sehemu'))}">${TABS.map(t => `<button type="button" class="mk-chip" data-tab="${t[0]}" aria-pressed="${o.tab === t[0]}">${esc(L(t[1], t[2]))}</button>`).join('')}</div>`;
      if(o.tab === 'methods'){
        html += METHODS.map(m => `<div class="ob-card"><div class="ob-q">${esc(m.who)}</div>${m.steps.map(s => `<div class="ob-h">${esc(s[0])}</div><p class="ob-p">${esc(s[1])}</p>`).join('')}<div class="ob-method">${esc(L('Source', 'Chanzo'))}: ${esc(m.src)}</div></div>`).join('');
      } else if(o.tab === 'obj'){
        const groups = ['all'].concat(Array.from(new Set(OBJ.map(x => x.group))));
        const res = filterObj(OBJ, o);
        html += `<label for="obQ" class="ag-meta">${esc(L('Search', 'Tafuta'))}</label><input id="obQ" class="ob-in" type="search" value="${esc(o.q)}" placeholder="${esc(L('e.g. SACCO, claims, spouse, SHA', 'mfano: SACCO, madai, mwenzi, SHA'))}">
          <div class="ob-chips" role="group" aria-label="${esc(L('Line of business', 'Aina ya bima'))}">${LINES.map(l => `<button type="button" class="mk-chip" data-line="${l[0]}" aria-pressed="${o.line === l[0]}">${esc(L(l[1], l[2]))}</button>`).join('')}</div>
          <div class="ob-chips" role="group" aria-label="${esc(L('Theme', 'Mada'))}">${groups.map(g => `<button type="button" class="mk-chip" data-group="${g}" aria-pressed="${o.group === g}">${esc(g === 'all' ? L('All themes', 'Mada zote') : g)}</button>`).join('')}</div>
          <div class="ag-meta" role="status" aria-live="polite">${esc(L(res.length + ' objection(s)', 'Pingamizi ' + res.length))}</div>
          ${res.map(x => `<div class="ob-card"><div class="ob-q">${esc(x.q)}</div><div class="ob-h">${esc(L('Say', 'Sema'))}</div><div class="ob-say">${esc(x.say)}</div>
            <details class="ob-det"><summary>${esc(L('What may be behind it, questions, proof, what to avoid', 'Kinachoweza kuwa nyuma yake, maswali, ushahidi, cha kuepuka'))}</summary>
            <div class="ob-h">${esc(L('What may be behind it', 'Kinachoweza kuwa nyuma yake'))}</div><p class="ob-p">${esc(x.real)}</p>
            <div class="ob-h">${esc(L('Ask', 'Uliza'))}</div><p class="ob-p">${esc(x.ask)}</p>
            ${x.proof ? `<div class="ob-h">${esc(L('Proof you can use', 'Ushahidi'))}</div><p class="ob-p">${esc(x.proof)}</p>` : ''}
            <div class="ob-h">${esc(L('Avoid', 'Epuka'))}</div><p class="ob-p">${esc(x.avoid)}</p></details>
            <div class="ob-method">${esc(x.method)}</div><div class="at-row"><button type="button" class="at-btn sm" data-copy="${esc(x.id)}">${esc(L('Copy wording', 'Nakili'))}</button></div></div>`).join('') || `<div class="ob-card">${esc(L('Nothing matches. Clear the search or pick All.', 'Hakuna kinacholingana.'))}</div>`}`;
      } else if(o.tab === 'vs'){
        html += `<p class="ag-fine">${esc(L('For each alternative: where it genuinely wins, what it does not do, what a plan adds, and a question to move forward. Compare facts only; never run down another company or product.', 'Kwa kila mbadala: inaposhinda, isichofanya, tunachoongeza, na swali la kuendelea. Linganisha ukweli tu.'))}</p>` +
          VS.map(v => `<div class="ob-card"><div class="ob-q">${esc(v.name)}</div><div class="ob-h">${esc(L('Where it wins', 'Inaposhinda'))}</div><p class="ob-p">${esc(v.concede)}</p><div class="ob-h">${esc(L('What it does not do', 'Isichofanya'))}</div><p class="ob-p">${esc(v.gap)}</p><div class="ob-h">${esc(L('What a plan adds', 'Tunachoongeza'))}</div><p class="ob-p">${esc(v.edge)}</p><div class="ob-h">${esc(L('Ask', 'Uliza'))}</div><p class="ob-p">${esc(v.bridge)}</p><div class="ob-method">${esc(L('Careful: ', 'Tahadhari: '))}${esc(v.caution)}</div>${v.cat && root.MarketCompare ? `<div class="at-row"><button type="button" class="at-btn sm" data-mkt="${esc(v.cat)}">${esc(L('See market products', 'Tazama bidhaa za soko'))}</button></div>` : ''}</div>`).join('');
      } else if(o.tab === 'edge'){
        html += `<p class="ag-fine">${esc(L('Points taken from the official Jubilee brochures. Confirm current terms in the policy document before quoting.', 'Hoja kutoka kwa brosha rasmi za Jubilee. Thibitisha masharti ya sasa kabla ya kunukuu.'))}</p>` +
          EDGE.map(e => `<div class="ob-card"><div class="ob-q">${esc(e.plan)} <span class="ag-meta">· ${esc(e.need)}</span></div><ul class="ob-p" style="padding-left:18px;">${e.pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul><div class="ob-h">${esc(L('Be upfront about', 'Kuwa wazi kuhusu'))}</div><p class="ob-p">${esc(e.watch)}</p>${e.cat && root.MarketCompare ? `<div class="at-row"><button type="button" class="at-btn sm" data-mkt="${esc(e.cat)}">${esc(L('Compare with the market', 'Linganisha na soko'))}</button></div>` : ''}</div>`).join('');
      } else {
        html += `<p class="ag-fine">${esc(L('Use these as context, with the source named. Figures change: check the current release before quoting in a client meeting.', 'Tumia kama muktadha, ukitaja chanzo. Takwimu hubadilika: thibitisha kabla ya kunukuu.'))}</p>` + FACTS.map(f => `<div class="ob-card"><p class="ob-p">${esc(f.t)}</p><div class="ob-method">${esc(L('Source', 'Chanzo'))}: ${esc(f.src)}</div></div>`).join('');
      }
      body.innerHTML = html;
      $$('[data-tab]', body).forEach(b => b.addEventListener('click', () => { o.tab = b.dataset.tab; draw(); body.scrollTop = 0; }));
      $$('[data-line]', body).forEach(b => b.addEventListener('click', () => { o.line = b.dataset.line; draw(); }));
      $$('[data-group]', body).forEach(b => b.addEventListener('click', () => { o.group = b.dataset.group; draw(); }));
      $$('[data-copy]', body).forEach(b => b.addEventListener('click', () => { const x = OBJ.find(z => z.id === b.dataset.copy); if(x) copy(x.say + '\n\n' + x.ask); }));
      $$('[data-mkt]', body).forEach(b => b.addEventListener('click', () => root.MarketCompare.open({ cat: b.dataset.mkt })));
      const q = $('#obQ', body); if(q) q.addEventListener('input', () => { o.q = q.value; const pos = q.selectionStart; draw(); const n = $('#obQ', body); n.focus(); try{ n.setSelectionRange(pos, pos); }catch(e){} });
    };
    draw();
  });
}
(root.AccountExtras = root.AccountExtras || []).unshift({ id: 'objections', label: () => L('Objection playbook', 'Mwongozo wa pingamizi'), fn: open });
root.ObjectionLibrary = Object.assign({ open }, PURE);
injectCss();
})(typeof window !== 'undefined' ? window : null);
