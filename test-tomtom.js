import 'dotenv/config';

const key = process.env.TOMTOM_API_KEY;

if (!key) {
    console.error("❌ KEY não encontrada.");
    process.exit(1);
}

const bbox = "-46.825,-23.682,-46.365,-23.356";

// TENTATIVA SEM LANGUAGE (Default)
const urlV5 = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${key}&bbox=${bbox}&fields={incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},startTime,endTime,from,to,length,delay,roadNumbers}}}`;

console.log("🔍 Testando API TomTom Versão 5 (Sem Lang)...");
console.log(`📡 URL: ${urlV5.replace(key, "HIDDEN")}`);

try {
    const response = await fetch(urlV5);
    console.log(`📥 Status: ${response.status}`);

    if (!response.ok) {
        console.log(await response.text());
    } else {
        const data = await response.json();

        if (data.incidents) {
            console.log(`✅ [V5] Incidentes encontrados: ${data.incidents.length}`);
            if (data.incidents.length > 0) {
                const inc = data.incidents[0];
                console.log("Exemplo de Incidente V5:");
                console.log(`- Tipo: ${inc.properties.iconCategory}`);
                console.log(`- Desc: ${inc.properties.events?.[0]?.description}`);
                console.log(`- Local: ${inc.properties.from} -> ${inc.properties.to}`);
            }
        } else {
            console.log("❌ [V5] Campo 'incidents' não encontrado.");
        }
    }

} catch (e) {
    console.error(e);
}
