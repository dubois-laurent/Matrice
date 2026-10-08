### 1 // Stack technique

- Python / FastAPI / httpx / pytest

Pydantic valide le contenu des événements, httpx envoie les livraisons au partenaire.

### 2 // Choix et explications

Les contrôles se font dans cet ordre, du moins coûteux au plus coûteux :

1. **Taille** : au plus 64 Ko (413).

2. **Timestamp** : `X-Timestamp` doit être un entier, à moins de 300 s de l'heure de réception (401).

3. **Signature** : HMAC-SHA256 de `timestamp + "." + corps brut` avec le secret local. La comparaison utilise `hmac.compare_digest` (temps constant) (401).

4. **Contenu** : vérifié seulement une fois l'appelant authentifié (400).

Le message signé est le **corps brut**, tel que reçu. Re-sérialiser le JSON changerait les espaces ou l'ordre des clés, donc la signature. Un test envoie un JSON écrit avec des espaces inhabituels.

Le secret `matrice-local-only` est fourni par le sujet : il est dans le code par défaut et peut être changé avec la variable `WEBHOOK_SECRET`. Il n'est jamais écrit dans les logs. Les logs ne contiennent que l'`event_id`, la raison du refus et les tentatives : ni la signature, ni le contenu de la séance.

## Déduplication et idempotence

- **Côté récepteur** : `event_id` est la clé. Un événement déjà vu reçoit `200 duplicate:true` et n'est pas renvoyé au partenaire. Aucun `await` ne sépare la lecture de l'écriture, donc deux requêtes simultanées avec le même `event_id` ne peuvent pas passer toutes les deux.

- **Côté partenaire** : `Idempotency-Key` = `event_id`. Une même clé ne crée jamais deux tickets : la 2e requête reçoit le ticket existant (200).

- **Pourquoi les deux** : le récepteur évite d'envoyer deux fois ; le partenaire protège quand le récepteur réessaie sans savoir si la première tentative a abouti. C'est exactement le cas du mode `slow` : le partenaire crée le ticket, mais répond après le timeout. Les tentatives suivantes reçoivent le même ticket.

## Timeout et reprise

- Chaque tentative est limitée à **2 s** (`asyncio.timeout`). Au-delà, c'est un échec temporaire.

- **3 tentatives au plus**, avec une attente de **0,2 s** puis **0,4 s** entre elles.

- **On réessaie** sur timeout, erreur de connexion, 429 et 5xx : ces erreurs peuvent disparaître.

- **On ne réessaie pas** sur les autres 4xx (par exemple 400) : la requête est refusée telle quelle, la renvoyer ne changerait rien.

- Après l'échec final ou un refus définitif, la livraison passe en **quarantine**. Elle reste consultable par `GET /deliveries/{event_id}` avec le nombre de tentatives.

- Le récepteur répond **202** tout de suite et livre en tâche de fond : le partenaire lent ne bloque pas l'appelant.

| Mode du partenaire | Résultat |
|---|---|
| ok | delivered, 1 tentative |
| flaky | 503 puis succès : delivered, 2 tentatives |
| down | 503 permanent : quarantine, 3 tentatives |
| slow | réponse après 3 s : timeout à 2 s, quarantine, 3 tentatives, un seul ticket |
| reject | 400 permanent : quarantine, 1 tentative |