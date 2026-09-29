Write a Python 3 command-line program `wordfreq.py` that prints the most frequent words of a text.

Requirements:
- Usage: `python3 wordfreq.py [N] < input.txt`. The program reads UTF-8 text from stdin.
- A word is a maximal run of ASCII letters `A`–`Z` and `a`–`z`. Every other character is a separator: whitespace, punctuation, digits, underscores, hyphens, apostrophes and all non-ASCII characters. So `Don't` yields the words `don` and `t`, `e-mail` yields `e` and `mail`, `room101b` yields `room` and `b`, and `café` yields `caf`.
- Words are counted case-insensitively and printed in lowercase.
- Print the top N words, one per line, as the word, a single space and its count (for example `the 7`). Sort by count descending, and break ties alphabetically ascending. If there are fewer than N distinct words, print all of them.
- N is the optional first argument and defaults to 10. It must be a decimal integer of at least 1, written with digits only.
- If N is not such an integer, or more than one argument is given, print a one-line usage message to stderr, print nothing to stdout and exit with status 2.
- Empty input, or input without any word, prints nothing and exits with status 0.
- Print nothing else to stdout.
- It must handle large inputs (hundreds of megabytes) efficiently: a single streaming pass with memory proportional to the number of distinct words, not to the input size.
- Standard library only.
