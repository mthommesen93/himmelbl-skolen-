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

  const { apiKey, topic, company, prompt, mode, courseTitle, lessonTitle } = req.body || {};
  const activeKey = apiKey || process.env.OPENAI_API_KEY || '';

  // 1. GENERATE AI CASE STUDY
  if (mode === 'case') {
    const casePrompt = `Du er en erfaren fagkonsulent for Himmelblå (barnevern, helse og omsorg, fosterhjem og BPA).
Lag en realistisk, engasjerende og faglig krevende case/dilemmasituasjon for ansatte.
Tema / Leksjon: "${lessonTitle || topic || 'Etisk dilemma'}". Kurs: "${courseTitle || 'Himmelblå Fagkurs'}".
Spesifikke ønsker: "${prompt || 'Fokus på deeskalering, rettssikkerhet og relasjonskompetanse'}".

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

  // 2. GENERATE LESSON CONTENT
  if (mode === 'lesson') {
    const lessonPrompt = `Du er en pedagogisk kursekspert for Himmelblå.
Generer pedagogisk innhold for en leksjon: "${lessonTitle}". Kurs: "${courseTitle}". Tema: "${topic || ''}".
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

  // 3. GENERATE FULL COURSE
  const systemPrompt = `Du er en pedagogisk kursekspert for Himmelblå (barnevern, helse og omsorg, BPA og fosterhjem). Lag et kurs på norsk som ren JSON:
{
  "title": "Kurstittel",
  "description": "Beskrivelse",
  "tags": ["Tag1", "Tag2"],
  "modules": [
    {
      "id": 1,
      "title": "Modul 1: Tittel",
      "lessons": [
        {
          "id": 101,
          "title": "Leksjonstittel",
          "duration": "5 min",
          "blocks": [
            { "id": "b1", "type": "text", "content": { "text": "Innhold..." } },
            { "id": "b2", "type": "quiz", "content": { "question": "Spørsmål?", "options": ["A", "B", "C"], "answer": 0 } }
          ]
        }
      ]
    }
  ]
}`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Lag et kurs om: "${topic}". Målgruppe: "${company}". Ønsker: "${prompt || 'Praktisk og pedagogisk'}"` }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (openAiRes.ok) {
      const data = await openAiRes.json();
      const course = JSON.parse(data.choices[0].message.content);
      return res.status(200).json({ success: true, course, source: 'openai' });
    }
  } catch (err) {
    console.error(err);
  }

  return res.status(200).json({
    success: true,
    course: {
      title: topic || "Nytt fagkurs for Himmelblå",
      description: `Opplæring i ${topic || 'rutiner'} for ${company || 'Himmelblå'}.`,
      tags: ["Fagkurs", "HMS"],
      modules: [
        {
          id: 1,
          title: "Modul 1: Introduksjon",
          lessons: [
            {
              id: 101,
              title: "Oversikt og bakgrunn",
              duration: "5 min",
              blocks: [
                { id: "b1", type: "text", content: { text: "Velkommen til kurset..." } },
                { id: "b2", type: "quiz", content: { question: "Hva er kursets hovedmål?", options: ["Sikre god faglig praksis", "Spare tid", "Ingen av delene"], answer: 0 } }
              ]
            }
          ]
        }
      ]
    },
    source: 'template'
  });
}
