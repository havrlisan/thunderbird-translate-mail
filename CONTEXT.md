# Mail Translation

A Thunderbird add-on that translates the message you are reading into your preferred language using a cloud translation service of your choice.

## Language

**Provider**:
An external translation service (Google, Microsoft, DeepL, Yandex) that performs translations, selected and credentialed by the user.
_Avoid_: Service, engine, backend

**Target Language**:
The single language, configured by the user, that messages are translated into.
_Avoid_: Default language, destination language

**Source Language**:
The language a message is written in, as detected by the Provider during translation.
_Avoid_: Original language, from-language

**Translation**:
The translated rendering of one message (subject and body) for one Target Language by one Provider.

**Original**:
The message content as received, shown when the Translation is toggled off.
