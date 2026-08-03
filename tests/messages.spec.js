import assert from 'node:assert';
import { describe, it } from 'node:test';
import { contentToMrkdwn, isRichTextContent, toRichTextInitialValue } from '../src/utils/messages.js';

describe('Rich text helpers', () => {
  it('passes plain text through unchanged', () => {
    assert.equal(contentToMrkdwn('hello world'), 'hello world');
    assert.equal(contentToMrkdwn(''), '');
    assert.equal(isRichTextContent('plain text'), false);
  });

  it('converts bold, italic, code, links, mentions and channels to mrkdwn', () => {
    const richText = JSON.stringify([
      {
        type: 'rich_text_section',
        elements: [
          { type: 'text', text: 'Bold', bold: true },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'italic', italic: true },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'code', code: true },
          { type: 'text', text: ' link ' },
          { type: 'link', url: 'https://hackclub.com', text: 'Hack Club' },
          { type: 'text', text: ' for ' },
          { type: 'user', user_id: 'U123' },
          { type: 'text', text: ' in ' },
          { type: 'channel', channel_id: 'C456' },
        ],
      },
    ]);

    const output = contentToMrkdwn(richText);
    assert(output.includes('*Bold*'));
    assert(output.includes('_italic_'));
    assert(output.includes('`code`'));
    assert(output.includes('<https://hackclub.com|Hack Club>'));
    assert(output.includes('<@U123>'));
    assert(output.includes('<#C456>'));
  });

  it('converts lists, quotes and preformatted blocks', () => {
    const richText = JSON.stringify([
      {
        type: 'rich_text_list',
        style: 'bullet',
        elements: [
          { type: 'rich_text_section', elements: [{ type: 'text', text: 'one' }] },
          { type: 'rich_text_section', elements: [{ type: 'text', text: 'two' }] },
        ],
      },
      {
        type: 'rich_text_quote',
        elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: 'quoted' }] }],
      },
      { type: 'rich_text_preformatted', elements: [{ type: 'text', text: 'const x = 1;' }] },
    ]);

    const output = contentToMrkdwn(richText);
    assert(output.includes('• one'));
    assert(output.includes('• two'));
    assert(output.includes('> quoted'));
    assert(output.includes('const x = 1;'));
  });

  it('wraps plain text for the rich text editor and passes rich text through', () => {
    const initial = toRichTextInitialValue('hello world');
    assert.equal(initial.type, 'rich_text');
    assert.equal(initial.elements[0].type, 'rich_text_section');
    assert.equal(initial.elements[0].elements[0].text, 'hello world');

    const jsonValue = '[{"type":"rich_text_section","elements":[{"type":"text","text":"hi"}]}]';
    assert.equal(isRichTextContent(jsonValue), true);
    const passedThrough = toRichTextInitialValue(jsonValue);
    assert.equal(passedThrough.type, 'rich_text');
    assert.equal(passedThrough.elements.length, 1);
    assert.equal(toRichTextInitialValue(''), undefined);
  });
});
