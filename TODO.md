# Huffman Tree Construction

* Code highlighting is a bit inconsistent
    * The if in dequeue_min shouldn't be highlighted when the return is highlighted
    * The "def dequeue_min" line doesn't need to be highlighted
* There are still issues with prev highlighting the wrong sections of code
    * Going back while the "while" line is highlighted highlights basically everything
* The fly in/outs for the comparison should remain static while the "if" is highlighted, and fly when a branch is selected

# Naive Huffman Encoding

* There is a dead state when pressing prev, when going back from the beginning of a symbol to the end of the previous.
* All animations auto-play, not just the one currently on screen. Animations off screen should not auto play.
