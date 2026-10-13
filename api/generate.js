export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, topic, company, prompt, mode, courseTitle, lessonTitle, messages, documentText } = req.body || {};
  const activeKey = apiKey || process.env.OPENAI_API_KEY || '';

  // 1. INTERAKTIV SAMTALE MED AI KURSASSISTENT (CHAT MED PDF-KONTEKST)
  if (mode === 'chat') {
    const systemPrompt = `Du er Himmelblås sjefskonsulent for kursutvikling og pedagogisk designer.
Du hjelper kursforfattere (Mari og Marius) med å analysere fagstoff, besvare spørsmål om rutiner/prosedyrer, og skreddersy kurs for ansatte i barnevern, helse og omsorg, fosterhjem og BPA.

${documentText ? `--- DOKUMENTASJON / PDF LASTET OPP AV BRUKEREN ---
${documentText.slice(0, 45000)}
--- SLUTT PÅ DOKUMENTASJON ---

Bruk informasjonen i dokumentet over til å svare nøyaktig på spørsmål, henvise til gjeldende rutiner, og foreslå konkrete moduler, leksjoner og dilemmaer.` : 'Brukeren har ikke lastet opp et dokument ennå, men du gir veiledning basert på beste praksis for Himmelblå og gjeldende norsk lovverk.'}

Vær hjelpsom, pedagogisk, tydelig og faglig sterk på norsk. Hvis brukeren ber deg foreslå eller justere kursoppsettet, presenter gjerne en ryddig disposisjon med forslag til moduler, caser og quizer. Minnn dem på at de kan klikke på "Bygg kurset" for å overføre oppsettet direkte til studioet.`;

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...(messages || []).map(m => ({ role: m.role, content: m.content }))
    ];

    if (activeKey) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: openAiMessages,
            temperature: 0.7
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const reply = data.choices[0].message.content;
          return res.status(200).json({ success: true, reply, source: 'openai' });
        } else {
          const errTxt = await resp.text();
          console.error('OpenAI chat error:', errTxt);
        }
      } catch (err) {
        console.error('Chat generation error:', err);
      }
    }

    return res.status(200).json({
      success: true,
      reply: `Jeg har mottatt dine ønsker for kurset! ${documentText ? 'Jeg ser igjennom det opplastede dokumentet ditt og kan hjelpe deg med å trekke ut de viktigste rutinene.' : ''} Hva ønsker du at vi fokuserer på i modulene?`,
      source: 'fallback'
    });
  }

  // 2. GENERER FULLT KURS (BASERT PÅ CHAT-HISTORIKK OG PDF-TEKST)
  if (mode === 'course' || mode === 'build_from_chat') {
    const courseSystemPrompt = `Du er en pedagogisk kursekspert for Himmelblå (barnevern, helse og omsorg, BPA og fosterhjem). 
Du skal generere et komplett, ferdig og innholdsrikt kurs på norsk basert på brukerens instruksjoner og eventuell opplastet dokumentasjon/PDF.

${documentText ? `--- OPPGITT FAGDOKUMENT / PDF ---
${documentText.slice(0, 45000)}
--- SLUTT PÅ FAGDOKUMENT ---` : ''}

Svaret MÅ VÆRE KUN REN GYLDIG JSON, uten markdown code blocks eller introduksjon, i nøyaktig dette formatet:
{
  "title": "Kurstittel",
  "description": "Fyldig ingress og kursbeskrivelse (2-3 setninger) som forklarer kursets nytteverdi og mål.",
  "tags": ["Fagtagg1", "Fagtagg2", "HMS"],
  "modules": [
    {
      "id": 1,
      "title": "Modul 1: [Navn på modul]",
      "lessons": [
        {
          "id": 101,
          "title": "Leksjonstittel",
          "duration": "5-10 min",
          "blocks": [
            {
              "id": "b-t1",
              "type": "text",
              "content": {
                "text": "Grundig, velskrevet fagtekst med overskrifter, punkter og praktiske eksempler hentet fra fagstoffet..."
              }
            },
            {
              "id": "b-c1",
              "type": "aicase",
              "content": {
                "title": "Dilemma: [Situasjon]",
                "scenario": "En realistisk hendelse i avdelingen...",
                "question": "Hva bør du gjøre?",
                "options": [
                  { "text": "A) [Beste handling]", "feedback": "Faglig begrunnelse...", "correct": true },
                  { "text": "B) [Feil/risikabel handling]", "feedback": "Forklaring på hvorfor dette er feil...", "correct": false },
                  { "text": "C) [Alternativ handling]", "feedback": "Forklaring...", "correct": false }
                ]
              }
            },
            {
              "id": "b-q1",
              "type": "quiz",
              "content": {
                "question": "Kontrollspørsmål?",
                "options": ["Svar A", "Svar B", "Svar C"],
                "answer": 0
              }
            }
          ]
        }
      ]
    }
  ]
}`;

    const userInstructions = `Kurstema: "${topic || courseTitle || 'Fagkurs'}". Målgruppe: "${company || 'Himmelblå ansatte'}". 
Spesifikke ønsker og instruksjoner: "${prompt || 'Gjør kurset praktisk og praksisnært med realistiske caser og grundig fagtekst'}".
${messages && messages.length > 0 ? `Tidligere samtalelogikk:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}
Bygg 2-4 velstrukturerte moduler med 2-3 leksjoner i hver, og sørg for at leksjonene har gode fagtekster, quizer og gjerne en interaktiv dilemma-case.`;

    if (activeKey) {
      try {
        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: courseSystemPrompt },
              { role: 'user', content: userInstructions }
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' }
          })
        });

        if (openAiRes.ok) {
          const data = await openAiRes.json();
          const course = JSON.parse(data.choices[0].message.content);
          return res.status(200).json({ success: true, course, source: 'openai' });
        } else {
          const errTxt = await openAiRes.text();
          console.error('OpenAI course build error:', errTxt);
        }
      } catch (err) {
        console.error('Course build error:', err);
      }
    }

    return res.status(200).json({
      success: true,
      course: {
        title: topic || "Nytt fagkurs for Himmelblå",
        description: `Strukturert opplæring basert på gjeldende faglige retningslinjer for ${company || 'Himmelblå'}.`,
        tags: ["Fagkurs", "HMS"],
        modules: [
          {
            id: 1,
            title: "Modul 1: Grunnleggende prinsipper og rutiner",
            lessons: [
              {
                id: 101,
                title: "Oversikt og formål",
                duration: "5 min",
                blocks: [
                  { id: "b1", type: "text", content: { text: "Velkommen til kurset! Her går vi igjennom de sentrale rutinene for trygt og forsvarlig arbeid." } },
                  { id: "b2", type: "quiz", content: { question: "Hva er det viktigste formålet med prosedyren?", options: ["Sikre trygghet og god kvalitet", "Mindre papirarbeid", "Ingen av delene"], answer: 0 } }
                ]
              }
            ]
          }
        ]
      },
      source: 'template'
    });
  }

  // 3. GENERATE AI CASE STUDY
  if (mode === 'case') {
    const casePrompt = `Du er en erfaren fagkonsulent for Himmelblå (barnevern, helse og omsorg, fosterhjem og BPA).
Lag en realistisk, engasjerende og faglig krevende case/dilemmasituasjon for ansatte.
Tema / Leksjon: "${lessonTitle || topic || 'Etisk dilemma'}". Kurs: "${courseTitle || 'Himmelblå Fagkurs'}".
Spesifikke ønsker: "${prompt || 'Fokus på deeskalering, rettssikkerhet og relasjonskompetanse'}".

${documentText ? `--- FAGLIG GRUNNLAG FRA OPPGITT DOKUMENT ---
${documentText.slice(0, 30000)}
--- SLUTT PÅ GRUNNLAG ---` : ''}

Svar med KUN gyldig JSON:
{
  "title": "Tittel på casen (f.eks: 'Dilemma: Medisinnekt og aggresjon på kveldsvakt')",
  "scenario": "Detaljert beskrivelse av situasjonen som oppstår i avdelingen eller boligen...",
  "question": "Hva bør du gjøre som miljøterapeut i denne situasjonen?",
  "options": [
    {
      "text": "A) [Første handlingsalternativ]",
      "feedback": "Faglig vurdering av dette valget (hvorfor dette er rett/galt, relevante lovverk og konsekvenser)...",
      "correct": true
    },
    {
      "text": "B) [Andre handlingsalternativ]",
      "feedback": "Faglig vurdering av dette valget...",
      "correct": false
    },
    {
      "text": "C) [Tredje handlingsalternativ]",
      "feedback": "Faglig vurdering av dette valget...",
      "correct": false
    }
  ]
}`;

    if (activeKey) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Du returnerer kun ren JSON for en interaktiv case.' },
              { role: 'user', content: casePrompt }
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' }
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const parsed = JSON.parse(data.choices[0].message.content);
          return res.status(200).json({ success: true, caseData: parsed, source: 'openai' });
        }
      } catch (err) {
        console.error('OpenAI case generation failed:', err);
      }
    }

    // Fallback case
    return res.status(200).json({
      success: true,
      caseData: {
        title: `Dilemma i ${lessonTitle || topic || 'praksis'}`,
        scenario: `Du er på ettermiddagsvakt i en barnevernsavdeling. En ungdom på 15 år nekter å overholde husordensreglene og låser seg inne på rommet sitt. Ungdommen virker urolig og avvisende til kontakt.`,
        question: "Hva er den beste faglige fremgangsmåten?",
        options: [
          {
            text: "A) Gi ungdommen tid og rom i 20 minutter, før du banker rolig på og tilbyr en matbit eller samtale uten krav.",
            feedback: "Riktig tilnærming! Deeskalering og trygg relasjonsbygging ivaretar ungdommens integritet og reduserer konfliktnivået.",
            correct: true
          },
          {
            text: "B) Låse opp døren med masternøkkel umiddelbart og kreve at ungdommen kommer ut.",
            feedback: "Uheldig valg. Å tvinge opp døren uten akutt fare for liv og helse krenker privatlivet og kan eskalere situasjonen til tvangsbruk.",
            correct: false
          },
          {
            text: "C) Ignorere situasjonen helt og overlate ansvaret til nattevakten uten å loggføre.",
            feedback: "Feil. Det er viktig å følge opp ungdommen og dokumentere hendelsesforløpet i journalen.",
            correct: false
          }
        ]
      },
      source: 'template'
    });
  }

  // 4. GENERATE LESSON CONTENT
  if (mode === 'lesson') {
    const lessonPrompt = `Du er en pedagogisk kursekspert for Himmelblå.
Generer pedagogisk innhold for leksjonen: "${lessonTitle}". Kurs: "${courseTitle}". Tema: "${topic || ''}".
${documentText ? `--- DOKUMENTKONTEKST ---\n${documentText.slice(0, 30000)}\n--- SLUTT PÅ DOKUMENTKONTEKST ---` : ''}

Svar med KUN gyldig JSON med innholdsblokker:
{
  "blocks": [
    {
      "id": "b-text",
      "type": "text",
      "content": {
        "text": "Fyldig og velskrevet fagtekst for leksjonen med punktlister og gode råd..."
      }
    },
    {
      "id": "b-quiz",
      "type": "quiz",
      "content": {
        "question": "Et relevant kontrollspørsmål til leksjonen?",
        "options": ["Svar A", "Svar B", "Svar C"],
        "answer": 0
      }
    }
  ]
}`;

    if (activeKey) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Du returnerer kun ren JSON for leksjonsinnhold.' },
              { role: 'user', content: lessonPrompt }
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' }
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const parsed = JSON.parse(data.choices[0].message.content);
          return res.status(200).json({ success: true, blocks: parsed.blocks, source: 'openai' });
        }
      } catch (err) {
        console.error('OpenAI lesson generation failed:', err);
      }
    }

    return res.status(200).json({
      success: true,
      blocks: [
        {
          id: 'b-text',
          type: 'text',
          content: {
            text: `Velkommen til leksjonen om ${lessonTitle || 'dette temaet'}.\n\nNøkkelpunkter:\n1. Trygghet og forutsigbarhet er grunnpilaren i vårt arbeid.\n2. Samarbeid tett med teamet og dokumenter observasjoner nøye.\n3. Rådfør deg alltid med fagansvarlig ved tvilstilfeller.`
          }
        },
        {
          id: 'b-quiz',
          type: 'quiz',
          content: {
            question: `Hva er viktigst å huske på ved ${lessonTitle || 'arbeid i avdeling'}?`,
            options: ['Å følge rutiner og ivareta brukerens trygghet', 'Å handle raskt alene uten dokumentasjon', 'Å vente til neste uke med å rapportere'],
            answer: 0
          }
        }
      ],
      source: 'template'
    });
  }

  return res.status(400).json({ error: 'Ugyldig modus' });
}
