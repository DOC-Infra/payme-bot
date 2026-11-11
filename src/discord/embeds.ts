import { Colors, EmbedBuilder } from 'discord.js';
import type { Card, Tone } from '../core';

const colors: Record<Tone, number> = {
	neutral: Colors.Greyple,
	info: Colors.Blurple,
	success: Colors.Green,
	warning: Colors.Yellow,
	danger: Colors.Red
};

const descriptionLimit = 4096;
const fieldValueLimit = 1024;

/** One embed per 4096-character part of the card's description. The title goes on the first, fields and footer on the last. */
export function toEmbeds(card: Card): EmbedBuilder[] {
	const parts = card.description ? splitLines(card.description, descriptionLimit) : [null];
	return parts.map((part, index) => {
		const embed = new EmbedBuilder().setColor(colors[card.tone]);
		if (index === 0 && card.title) embed.setTitle(card.title);
		if (part) embed.setDescription(part);
		if (index < parts.length - 1) return embed;

		if (card.fields?.length) embed.addFields(card.fields.map((field) => ({ ...field, value: truncate(field.value, fieldValueLimit) })));
		if (card.footer) embed.setFooter({ text: card.footer });
		return embed;
	});
}

export function splitLines(text: string, limit: number): string[] {
	const lines = text.split('\n').flatMap((line) => line.match(new RegExp(`[\\s\\S]{1,${limit}}`, 'g')) ?? ['']);
	const parts = [lines[0]];
	for (const line of lines.slice(1)) {
		const last = parts[parts.length - 1];
		if (last.length + 1 + line.length > limit) parts.push(line);
		else parts[parts.length - 1] = `${last}\n${line}`;
	}
	return parts;
}

function truncate(text: string, limit: number): string {
	return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
